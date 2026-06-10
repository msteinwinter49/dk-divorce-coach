-- Phase 12: Per-admin notification preferences + coach designation
-- Run in Supabase SQL editor

-- 1. New columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_coach boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_reminder_channel text DEFAULT null;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_reminder_minutes integer DEFAULT null;

-- 2. Enforce at most one coach at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS one_coach ON profiles (is_coach) WHERE is_coach = true;

-- 3. Migrate current settings to the first admin profile
--    Sets is_coach=true, copies reminder settings, and fills preferred_email
--    from contact_email if the admin doesn't already have one.
UPDATE profiles
SET
  is_coach = true,
  admin_reminder_channel = COALESCE(
    (SELECT value FROM settings WHERE key = 'admin_reminder_channel'), 'both'
  ),
  admin_reminder_minutes = COALESCE(
    (SELECT value FROM settings WHERE key = 'admin_reminder_minutes'), '30'
  )::integer,
  preferred_email = COALESCE(
    preferred_email,
    (SELECT value FROM settings WHERE key = 'contact_email')
  )
WHERE role = 'admin'
  AND id = (SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1);
