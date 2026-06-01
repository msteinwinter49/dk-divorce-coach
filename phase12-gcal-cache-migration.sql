-- Phase 12 Migration — Google Calendar Event Cache
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- 1. GOOGLE_EVENTS_CACHE
-- ============================================
-- Stores Google Calendar events fetched in the last N minutes.
-- Serves as the fast-path for /api/availability and /api/calendar/events
-- so they don't hit the Google API on every request.
-- Refreshed on-demand when stale (see gcal_cache_fetched_at in settings).

create table public.google_events_cache (
  google_event_id text primary key,
  summary text,
  status text,            -- 'confirmed', 'cancelled', etc.
  transparency text,      -- null or 'transparent'
  event_type text,        -- 'sp', 'personal', etc. (from _type classification)
  is_all_day boolean not null default false,
  start_date date,        -- set for all-day events
  end_date date,          -- set for all-day events (exclusive, Google format)
  start_datetime timestamptz,  -- set for timed events
  end_datetime timestamptz,    -- set for timed events
  source_calendar_id text,
  source_calendar_name text,
  fetched_at timestamptz not null default now()
);

-- Only admin can read/write the cache
alter table public.google_events_cache enable row level security;
create policy "Admin can manage google_events_cache"
  on public.google_events_cache for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Fast range queries on start_datetime for timed events
create index google_events_cache_start_datetime_idx
  on public.google_events_cache (start_datetime);
