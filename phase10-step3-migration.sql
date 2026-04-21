-- Phase 10 Step 3: backfill balance ledger for existing bookings, then drop fee columns
-- Run AFTER deploying the step-3 code changes.

-- 1. Backfill: debit balance for every active booking that has no ledger row yet.
--    Uses apply_balance_delta so row-locking and balance_after are handled correctly.
--    Safe to re-run — the WHERE NOT EXISTS guard prevents double-debiting.
DO $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN
    SELECT bk.id, bk.user_id, bk.session_duration
    FROM bookings bk
    WHERE bk.status IN ('requested', 'booked')
      AND bk.session_duration IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM balance_ledger bl
        WHERE bl.source_id = bk.id
          AND bl.source_type IN ('request', 'cancel', 'decline')
      )
    ORDER BY bk.created_at
  LOOP
    PERFORM apply_balance_delta(
      p_client_id   => b.user_id,
      p_delta_minutes => -b.session_duration,
      p_source_type => 'request',
      p_source_id   => b.id,
      p_created_by  => NULL
    );
  END LOOP;
END $$;

-- 2. Drop fee columns now that no code references them.
ALTER TABLE bookings      DROP COLUMN IF EXISTS fee;
ALTER TABLE session_types DROP COLUMN IF EXISTS fee;
