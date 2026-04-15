-- Phase 9: Add timezone to profiles
-- Stores IANA timezone identifier (e.g. "America/New_York")

alter table profiles
  add column if not exists timezone text default 'America/New_York';
