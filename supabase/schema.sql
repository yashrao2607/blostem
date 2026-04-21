-- IRIS-AI Supabase schema (copied from IRIS-Web structure)
-- Run this in Supabase SQL Editor for your project:
-- https://foutqithcrqjwtunchkr.supabase.co

DO $$ BEGIN
    CREATE TYPE user_tier AS ENUM ('FREE', 'PRO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    google_id TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    tier user_tier DEFAULT 'FREE',
    -- 'approved' → allowed into the app immediately
    -- 'pending'  → legacy value retained for backwards compatibility
    -- 'rejected' → blocked
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    verified BOOLEAN DEFAULT FALSE,
    hwids TEXT[] DEFAULT '{}',
    token_version INTEGER DEFAULT 1,
    daily_limit INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile."
    ON public.users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
    ON public.users
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile."
    ON public.users
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- One device per user (current active PC binding).
CREATE TABLE IF NOT EXISTS public.user_devices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    platform TEXT,
    os TEXT,
    arch TEXT,
    app_version TEXT,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device."
    ON public.user_devices
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own device."
    ON public.user_devices
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device."
    ON public.user_devices
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Sign-in logs for diagnostics/audit.
CREATE TABLE IF NOT EXISTS public.user_signin_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    platform TEXT,
    os TEXT,
    arch TEXT,
    event TEXT NOT NULL CHECK (event IN ('SIGN_IN_SUCCESS', 'SIGN_IN_BLOCKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_signin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signin logs."
    ON public.user_signin_logs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own signin logs."
    ON public.user_signin_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, name, email, google_id, status)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'IRIS User'),
        new.email,
        new.raw_user_meta_data->>'sub',
        'approved'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: add status column if it doesn't exist yet (safe to run on existing DB)
DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'approved';
UPDATE public.users SET status = 'approved' WHERE status = 'pending';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
