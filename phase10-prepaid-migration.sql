-- Phase 10 Migration — Prepaid Package / Balance Model
-- Run in Supabase SQL Editor. Pre-launch: destructive drops are OK.

-- ============================================
-- 1. Drop per-session fee columns (pre-launch cleanup)
-- ============================================
alter table public.bookings       drop column if exists fee;
alter table public.session_types  drop column if exists fee;

-- ============================================
-- 2. PRICING MATRIX
-- ============================================
create table public.pricing_matrix (
  id              uuid default gen_random_uuid() primary key,
  duration_min    integer not null check (duration_min > 0),
  package_size    integer not null check (package_size > 0),
  price_cents     integer not null check (price_cents >= 0),
  expires_months  integer not null check (expires_months > 0),
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (duration_min, package_size)
);

alter table public.pricing_matrix enable row level security;
create policy "Authenticated can read active pricing"
  on public.pricing_matrix for select
  using (auth.uid() is not null and is_active = true);
create policy "Admin can manage pricing"
  on public.pricing_matrix for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================
-- 3. PURCHASES (money in + minutes granted)
-- ============================================
create table public.purchases (
  id                         uuid default gen_random_uuid() primary key,
  client_id                  uuid not null references public.profiles(id) on delete cascade,
  matrix_id                  uuid references public.pricing_matrix(id),
  duration_min               integer not null,
  package_size               integer not null,
  total_minutes              integer not null,
  amount_cents               integer not null,
  expires_months             integer not null,
  expires_at                 timestamptz not null,
  stripe_payment_intent_id   text,
  status                     text not null default 'pending'
                               check (status in ('pending','succeeded','failed','refunded')),
  purchased_at               timestamptz default now()
);

alter table public.purchases enable row level security;
create policy "Clients can read own purchases"
  on public.purchases for select
  using (auth.uid() = client_id);
create policy "Admin can read all purchases"
  on public.purchases for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index idx_purchases_client on public.purchases (client_id, purchased_at desc);

-- ============================================
-- 4. BALANCE LEDGER (minutes deltas + admin money log)
-- ============================================
-- delta_minutes:   non-zero for minute-moving events, zero for money-only admin actions
-- source_type:     what caused this row
-- source_id:       booking.id, purchase.id, etc.
-- amount_cents / stripe_* : populated for admin_charge, admin_refund, and purchase rows
-- ============================================
create table public.balance_ledger (
  id                         uuid default gen_random_uuid() primary key,
  client_id                  uuid not null references public.profiles(id) on delete cascade,
  delta_minutes              integer not null default 0,
  source_type                text not null check (source_type in (
    'purchase',       -- client purchase of a matrix cell
    'request',        -- client (or admin) requested a session: delta < 0
    'cancel',         -- booking cancelled: delta > 0
    'decline',        -- admin declined a request: delta > 0
    'edit_delta',     -- duration change on an existing booking: delta = (old - new)
    'admin_adjust',   -- admin gifted/removed minutes: delta = ±X, no money
    'admin_charge',   -- admin manual Stripe charge: delta = 0, amount_cents > 0
    'admin_refund',   -- admin manual Stripe refund: delta = 0, amount_cents > 0
    'expiration'      -- daily sweep: delta < 0, zeroes expired balance
  )),
  source_id                  uuid,
  amount_cents               integer,
  stripe_payment_intent_id   text,
  stripe_refund_id           text,
  note                       text,
  created_by                 uuid references public.profiles(id),
  created_at                 timestamptz default now()
);

alter table public.balance_ledger enable row level security;
create policy "Clients can read own ledger"
  on public.balance_ledger for select
  using (auth.uid() = client_id);
create policy "Admin can read all ledger"
  on public.balance_ledger for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
-- No direct insert/update/delete policies — writes go through apply_balance_delta()
-- or via service_role from server routes.

create index idx_ledger_client on public.balance_ledger (client_id, created_at desc);

-- ============================================
-- 5. ATOMIC BALANCE DELTA (concurrency safe)
-- ============================================
-- Locks the client's profile row FOR UPDATE, sums current balance,
-- inserts the delta row, returns before/after. Callers should wrap
-- in a transaction alongside the booking/purchase write.
-- ============================================
create or replace function public.apply_balance_delta(
  p_client_id                 uuid,
  p_delta_minutes             integer,
  p_source_type               text,
  p_source_id                 uuid          default null,
  p_amount_cents              integer       default null,
  p_stripe_payment_intent_id  text          default null,
  p_stripe_refund_id          text          default null,
  p_note                      text          default null,
  p_created_by                uuid          default null
) returns table (balance_before integer, balance_after integer)
language plpgsql security definer
as $$
declare
  current_balance integer;
begin
  -- Serialize balance ops per client
  perform 1 from public.profiles where id = p_client_id for update;

  select coalesce(sum(delta_minutes), 0) into current_balance
    from public.balance_ledger
    where client_id = p_client_id;

  insert into public.balance_ledger (
    client_id, delta_minutes, source_type, source_id,
    amount_cents, stripe_payment_intent_id, stripe_refund_id,
    note, created_by
  ) values (
    p_client_id, p_delta_minutes, p_source_type, p_source_id,
    p_amount_cents, p_stripe_payment_intent_id, p_stripe_refund_id,
    p_note, p_created_by
  );

  return query select current_balance, current_balance + p_delta_minutes;
end;
$$;

grant execute on function public.apply_balance_delta to authenticated;

-- ============================================
-- 6. CLIENT BALANCES VIEW
-- ============================================
-- Current balance, viability (latest purchase's expires_at), preferred duration.
-- Null viable_until = never purchased. UI should show "Buy sessions" CTA.
-- ============================================
create or replace view public.client_balances as
select
  p.id as client_id,
  coalesce((select sum(delta_minutes)
              from public.balance_ledger bl
              where bl.client_id = p.id), 0) as balance_minutes,
  (select pu.expires_at from public.purchases pu
     where pu.client_id = p.id and pu.status = 'succeeded'
     order by pu.purchased_at desc limit 1) as viable_until,
  (select pu.duration_min from public.purchases pu
     where pu.client_id = p.id and pu.status = 'succeeded'
     order by pu.purchased_at desc limit 1) as preferred_duration
from public.profiles p
where p.role = 'client';

grant select on public.client_balances to authenticated;
