-- ============================================================
-- 011_add_email_verification_otp.sql
-- Adds dedicated email verification OTP columns to profiles table
-- ============================================================

-- Add email verification OTP columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_verification_code text,
ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz;

-- Add index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_profiles_email_verification_code 
ON public.profiles(email_verification_code) 
WHERE email_verification_code IS NOT NULL;
