-- Phase 8 Migration — Notification Reminders
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- 1. PROFILES — add reminder preference
-- ============================================
alter table public.profiles
  add column if not exists reminder_preference text default 'both'
    check (reminder_preference in ('none', '24h', '1h', 'both'));

-- ============================================
-- 2. BOOKINGS — add reminder tracking
-- ============================================
alter table public.bookings
  add column if not exists client_reminder_sent_at timestamptz,
  add column if not exists admin_reminder_sent_at timestamptz;

-- ============================================
-- 3. SETTINGS — admin reminder preferences
-- ============================================
insert into public.settings (key, value)
values
  ('admin_reminder_channel', 'both'),
  ('admin_reminder_minutes', '30')
on conflict (key) do nothing;
