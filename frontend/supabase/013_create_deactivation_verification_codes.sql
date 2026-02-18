-- ============================================================
-- 013_create_deactivation_verification_codes.sql
-- Creates table for deactivation verification codes
-- ============================================================

-- Create deactivation_verification_codes table
CREATE TABLE IF NOT EXISTS public.deactivation_verification_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean NULL DEFAULT false,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT deactivation_verification_codes_pkey PRIMARY KEY (id),
  CONSTRAINT deactivation_verification_codes_user_id_code_key UNIQUE (user_id, code),
  CONSTRAINT deactivation_verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deactivation_codes_user_id 
ON public.deactivation_verification_codes USING btree (user_id) 
TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_deactivation_codes_code 
ON public.deactivation_verification_codes USING btree (code) 
TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_deactivation_codes_expires_at 
ON public.deactivation_verification_codes USING btree (expires_at) 
TABLESPACE pg_default;
