-- ============================================================
-- 012_fix_retell_api_key_constraint.sql
-- Fixes the NOT NULL constraint issue on retell_api_key column
-- ============================================================

-- Ensure retell_api_key column allows NULL values
ALTER TABLE public.profiles 
  ALTER COLUMN retell_api_key DROP NOT NULL;

-- Update the handle_new_user() trigger function to include retell_api_key
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    timezone,
    retell_api_key,
    total_minutes_used,
    "Total_credit",
    "Remaning_credits",
    is_deactivated,
    payment_status,
    trial_credits_expires_at,
    created_at,
    updated_at,
    last_activity_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'UTC',
    NULL,  -- retell_api_key - can be set later by the user
    0,       -- total_minutes_used
    0,       -- Total_credit (total credits ever purchased/added)
    0,       -- Remaning_credits (credits will be given after tour completion)
    false,
    'unpaid',
    now() + interval '7 days',  -- 7-day trial
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
