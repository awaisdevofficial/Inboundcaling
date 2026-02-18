-- ============================================================
-- 017_fix_handle_new_user_trigger.sql
-- Fixes the handle_new_user trigger to include tour_completed
-- and set initial credits to 0 (credits given after tour completion)
-- ============================================================

-- First, ensure tour_completed column exists (run 015_add_tour_support.sql first if needed)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tour_completed boolean DEFAULT false;

-- Update the handle_new_user() trigger function
-- This function is called automatically when a new user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try to insert the profile with all required fields
  -- Use ON CONFLICT to handle race conditions where the profile might already exist
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
    tour_completed,
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
    false,  -- tour_completed (user needs to complete tour to get credits)
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    -- The signup endpoint will handle profile creation via upsert if trigger fails
    RAISE WARNING 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
