-- Phase 8b Migration — Local Events Table
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- 1. EVENTS (local calendar events)
-- ============================================
create table public.events (
  id uuid default gen_random_uuid() primary key,
  summary text not null,
  date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  google_calendar_event_id text,  -- set after sync to Google Calendar
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;
create policy "Admin can manage events"
  on public.events for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
