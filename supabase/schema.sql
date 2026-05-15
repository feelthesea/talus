-- Run this in Supabase Dashboard → SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,                    -- null for OAuth users
  provider TEXT NOT NULL DEFAULT 'email', -- 'email' | 'google' | 'strava'
  provider_id TEXT,                      -- Google sub or Strava athlete id
  strava_access_token TEXT,
  strava_athlete_id BIGINT,
  utmb_index TEXT,
  itra_index TEXT,
  -- Physiological params (cached from last onboarding)
  lthr INTEGER,
  maxhr INTEGER,
  rhr INTEGER,
  weight NUMERIC(5,1),
  vam INTEGER,
  decouple_onset NUMERIC(4,1),
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blueprints table
CREATE TABLE IF NOT EXISTS public.blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  race_id TEXT NOT NULL,
  race_name TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  segments JSONB NOT NULL DEFAULT '[]',
  diagnostics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own row
CREATE POLICY "users_self" ON public.users
  FOR ALL USING (id::text = auth.uid()::text);

-- Blueprints belong to owner
CREATE POLICY "blueprints_owner" ON public.blueprints
  FOR ALL USING (user_id::text = auth.uid()::text);

-- Allow service role full access (for server-side operations)
CREATE POLICY "service_role_users" ON public.users
  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_blueprints" ON public.blueprints
  FOR ALL TO service_role USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS blueprints_user_id_idx ON public.blueprints(user_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_provider_idx ON public.users(provider, provider_id);
