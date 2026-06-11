-- Phase 14: System alerts table
-- Run in Supabase SQL editor before deploying.

CREATE TABLE public.system_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  category text NOT NULL,
  action text,
  resource text,
  summary text,
  error_detail text NOT NULL,
  emailed_at timestamptz,
  acknowledged boolean DEFAULT false
);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.system_alerts
  USING (false);
