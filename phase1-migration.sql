-- Phase 1 Migration — Calendar/Scheduling Schema
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- 1. SESSION TYPES
-- ============================================
create table public.session_types (
  id uuid default gen_random_uuid() primary key,
  label text not null,
  duration integer not null,          -- minutes
  fee numeric(10,2) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table public.session_types enable row level security;
create policy "Authenticated can read active session types"
  on public.session_types for select
  using (auth.uid() is not null and is_active = true);
create policy "Admin can manage session types"
  on public.session_types for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================
-- 2. AVAILABILITY RULES (recurring weekly)
-- ============================================
create table public.availability_rules (
  id uuid default gen_random_uuid() primary key,
  day_of_week integer not null check (day_of_week between 0 and 6),  -- 0=Sunday
  start_time time not null,
  end_time time not null,
  is_blocked boolean default false,   -- true = block (e.g. lunch)
  created_at timestamptz default now(),
  check (end_time > start_time)
);

alter table public.availability_rules enable row level security;
create policy "Authenticated can read availability rules"
  on public.availability_rules for select
  using (auth.uid() is not null);
create policy "Admin can manage availability rules"
  on public.availability_rules for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================
-- 3. AVAILABILITY OVERRIDES (one-off dates)
-- ============================================
create table public.availability_overrides (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  start_time time,                    -- null if is_available=false (blocks whole day)
  end_time time,
  is_available boolean not null,      -- true=add availability, false=remove
  created_at timestamptz default now(),
  check (is_available = false or (start_time is not null and end_time is not null and end_time > start_time))
);

alter table public.availability_overrides enable row level security;
create policy "Authenticated can read availability overrides"
  on public.availability_overrides for select
  using (auth.uid() is not null);
create policy "Admin can manage availability overrides"
  on public.availability_overrides for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================
-- 4. MODIFY BOOKINGS
-- ============================================
-- Drop the old unique constraint and status check
alter table public.bookings drop constraint if exists bookings_date_time_slot_key;
alter table public.bookings drop constraint if exists bookings_status_check;

-- Add new columns
alter table public.bookings
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists session_type_id uuid references public.session_types(id),
  add column if not exists session_duration integer,       -- minutes
  add column if not exists fee numeric(10,2),
  add column if not exists google_calendar_event_id text,
  add column if not exists stripe_payment_intent_id text;

-- Update status enum to new values
-- First set any existing 'confirmed' to 'booked'
update public.bookings set status = 'booked' where status = 'confirmed';

-- Replace the status check constraint
alter table public.bookings add constraint bookings_status_check
  check (status in ('requested', 'booked', 'cancelled', 'declined', 'expired'));

-- Add policy for clients to cancel their own requests
create policy "Clients can update own requested bookings"
  on public.bookings for update
  using (auth.uid() = user_id and status = 'requested');

-- Add policy for clients to delete (cancel) own requests
create policy "Clients can delete own requested bookings"
  on public.bookings for delete
  using (auth.uid() = user_id and status = 'requested');

-- Prevent overlapping bookings at DB level
create index idx_bookings_time_range on public.bookings (start_time, end_time)
  where status in ('requested', 'booked');

-- ============================================
-- 5. MODIFY PROFILES
-- ============================================
alter table public.profiles
  add column if not exists notification_preference text default 'email'
    check (notification_preference in ('email', 'text', 'both')),
  add column if not exists stripe_customer_id text,
  add column if not exists client_code text unique;

-- Auto-generate client_code for new profiles
create or replace function public.generate_client_code()
returns trigger as $$
declare
  new_code text;
begin
  if NEW.role = 'client' and NEW.client_code is null then
    loop
      new_code := 'CLT-' || lpad(floor(random() * 10000)::text, 4, '0');
      exit when not exists (select 1 from public.profiles where client_code = new_code);
    end loop;
    NEW.client_code := new_code;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_profile_generate_client_code
  before insert or update on public.profiles
  for each row execute function public.generate_client_code();

-- Backfill client_code for existing clients
do $$
declare
  r record;
  new_code text;
begin
  for r in select id from public.profiles where role = 'client' and client_code is null loop
    loop
      new_code := 'CLT-' || lpad(floor(random() * 10000)::text, 4, '0');
      exit when not exists (select 1 from public.profiles where client_code = new_code);
    end loop;
    update public.profiles set client_code = new_code where id = r.id;
  end loop;
end;
$$;

-- ============================================
-- 6. SETTINGS — add scheduling defaults
-- ============================================
-- Settings table already exists (key/value/updated_at).
-- Insert default scheduling settings.
insert into public.settings (key, value)
values
  ('scheduling_increment', '30'),
  ('booking_horizon_days', '30')
on conflict (key) do nothing;

-- ============================================
-- 7. UPDATE SCHEMA FILE REFERENCE
-- ============================================
-- Also adding settings table definition to schema for completeness.
-- (The table already exists in Supabase; this documents it.)
-- create table public.settings (
--   key text primary key,
--   value text,
--   updated_at timestamptz default now()
-- );
