-- Phase 10 Step 6: expire_purchase_minutes() function
-- For each client with unprocessed expired purchases:
--   1. Calculate minutes_to_expire = max(0, current_balance - active_purchase_minutes)
--   2. Write one balance_ledger row per expired purchase (oldest gets the debit, rest get 0)
-- Idempotent: NOT EXISTS guard per purchase prevents re-processing on re-run.

CREATE OR REPLACE FUNCTION public.expire_purchase_minutes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  client_rec RECORD;
  purchase_rec RECORD;
  current_bal integer;
  active_mins integer;
  to_expire integer;
  rows_written integer := 0;
BEGIN
  FOR client_rec IN
    -- Clients with at least one expired purchase that has no expiration ledger row yet
    SELECT DISTINCT p.client_id
    FROM public.purchases p
    WHERE p.status = 'succeeded'
      AND p.expires_at < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.balance_ledger bl
        WHERE bl.source_type = 'expiration'
          AND bl.source_id = p.id
      )
  LOOP
    -- Serialize per-client balance ops
    PERFORM 1 FROM public.profiles WHERE id = client_rec.client_id FOR UPDATE;

    -- Current balance
    SELECT coalesce(sum(delta_minutes), 0) INTO current_bal
    FROM public.balance_ledger
    WHERE client_id = client_rec.client_id;

    -- Minutes covered by still-active purchases
    SELECT coalesce(sum(total_minutes), 0) INTO active_mins
    FROM public.purchases
    WHERE client_id = client_rec.client_id
      AND status = 'succeeded'
      AND expires_at > now();

    -- Minutes to debit: whatever the balance exceeds active coverage
    to_expire := GREATEST(0, current_bal - active_mins);

    -- One ledger row per unprocessed expired purchase.
    -- Oldest gets the real debit; subsequent get 0 (idempotency markers).
    FOR purchase_rec IN
      SELECT p2.id
      FROM public.purchases p2
      WHERE p2.client_id = client_rec.client_id
        AND p2.status = 'succeeded'
        AND p2.expires_at < now()
        AND NOT EXISTS (
          SELECT 1 FROM public.balance_ledger bl
          WHERE bl.source_type = 'expiration'
            AND bl.source_id = p2.id
        )
      ORDER BY p2.expires_at ASC
    LOOP
      INSERT INTO public.balance_ledger (client_id, delta_minutes, source_type, source_id)
      VALUES (client_rec.client_id, -to_expire, 'expiration', purchase_rec.id);

      to_expire := 0; -- Only the first expired purchase carries the debit
      rows_written := rows_written + 1;
    END LOOP;
  END LOOP;

  RETURN rows_written;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_purchase_minutes TO service_role;
