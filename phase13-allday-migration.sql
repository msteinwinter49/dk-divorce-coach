-- Phase 13 Migration — All-Day Events
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

alter table public.events
  add column if not exists all_day boolean default false;
