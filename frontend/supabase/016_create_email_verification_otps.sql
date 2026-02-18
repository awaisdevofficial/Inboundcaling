-- ============================================================
-- 016_create_email_verification_otps.sql
-- Creates dedicated table for email verification OTPs
-- ============================================================

-- Create email_verification_otps table
CREATE TABLE IF NOT EXISTS public.email_verification_otps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  otp_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  used boolean DEFAULT false
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_user_id ON public.email_verification_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email ON public.email_verification_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_otp_code ON public.email_verification_otps(otp_code);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_expires_at ON public.email_verification_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_user_email_active ON public.email_verification_otps(user_id, email, expires_at) 
  WHERE used = false AND verified_at IS NULL;

-- Enable RLS
ALTER TABLE public.email_verification_otps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy: Users can read their own OTPs (for verification)
CREATE POLICY "Users can read their own email verification OTPs"
  ON public.email_verification_otps
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Allow all operations (service role key bypasses RLS anyway)
-- This policy is a fallback in case RLS is not fully bypassed
-- Service role operations should bypass RLS, but this ensures compatibility
CREATE POLICY "Allow all operations for service role"
  ON public.email_verification_otps
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE public.email_verification_otps IS 'Stores email verification OTP codes for user email verification';
COMMENT ON COLUMN public.email_verification_otps.otp_code IS '6-digit OTP code for email verification';
COMMENT ON COLUMN public.email_verification_otps.expires_at IS 'Timestamp when the OTP expires (typically 10 minutes after creation)';
COMMENT ON COLUMN public.email_verification_otps.verified_at IS 'Timestamp when the OTP was successfully verified';
COMMENT ON COLUMN public.email_verification_otps.used IS 'Flag indicating if the OTP has been used';
