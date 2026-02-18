-- ============================================================
-- 004_create_triggers.sql
-- Creates ALL triggers and trigger functions.
-- Run this AFTER 003_create_functions.sql
-- ============================================================

-- =============================================
-- 1. Auto-update updated_at on profiles
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables that have an updated_at column
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_bots_updated_at
  BEFORE UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_ai_prompts_updated_at
  BEFORE UPDATE ON public.ai_prompts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_email_rules_updated_at
  BEFORE UPDATE ON public.email_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_phone_numbers_updated_at
  BEFORE UPDATE ON public.imported_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_page_leads_updated_at
  BEFORE UPDATE ON public.page_leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_user_emails_updated_at
  BEFORE UPDATE ON public.user_emails
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_subscription_packages_updated_at
  BEFORE UPDATE ON public.subscription_packages
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_credit_costs_updated_at
  BEFORE UPDATE ON public.credit_costs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- =============================================
-- 2. Auto-create profile on auth.users insert
-- When a new user signs up through Supabase Auth,
-- automatically create a corresponding profile row.
-- =============================================
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

-- NOTE: This trigger runs on auth.users, which is in the auth schema.
-- You need appropriate permissions to create triggers on auth.users.
-- If you get an error, you may need to run this as a Supabase admin
-- or use the Supabase dashboard to create this trigger.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 3. Auto-deduct credits when a call is completed
-- This trigger fires when a call status changes to
-- 'completed' and has a duration, automatically
-- deducting credits from the user's profile.
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_call_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only process when status changes to 'completed' with a duration
  IF NEW.status = 'completed'
     AND NEW.duration_seconds IS NOT NULL
     AND NEW.duration_seconds > 0
     AND (OLD.status IS NULL OR OLD.status != 'completed')
  THEN
    -- Deduct credits
    v_result := public.deduct_call_credits(
      NEW.user_id,
      NEW.id,
      NEW.duration_seconds,
      jsonb_build_object(
        'trigger', 'auto_deduct',
        'call_status', NEW.status,
        'phone_number', NEW.phone_number
      )
    );

    -- If deduction failed due to insufficient credits, log it but don't block
    IF NOT (v_result->>'success')::boolean THEN
      -- Insert a warning notification
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.user_id,
        'warning',
        'Credit Deduction Issue',
        format('Could not deduct credits for call: %s', v_result->>'error'),
        v_result
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_call_completed
  AFTER UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_call_completed();

-- Also trigger on INSERT (for calls that are inserted already completed)
CREATE TRIGGER on_call_inserted_completed
  AFTER INSERT ON public.calls
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0)
  EXECUTE FUNCTION public.handle_call_completed();

-- =============================================
-- 4. Update last_activity_at on profile
-- When certain user actions happen.
-- =============================================
CREATE OR REPLACE FUNCTION public.update_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET last_activity_at = now()
   WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Track activity from calls
CREATE TRIGGER track_activity_calls
  AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_last_activity();

-- Track activity from bots
CREATE TRIGGER track_activity_bots
  AFTER INSERT OR UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.update_last_activity();

-- =============================================
-- 5. Auto-deduct credits when agent is created
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_agent_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only process on INSERT (new agent creation)
  IF TG_OP = 'INSERT' THEN
    -- Deduct credits for agent creation
    v_result := public.deduct_credits_for_action(
      NEW.user_id,
      'create_agent',
      1,  -- quantity
      NEW.id,  -- reference_id (bot id)
      jsonb_build_object(
        'bot_name', NEW.name,
        'bot_id', NEW.id,
        'trigger', 'auto_deduct_agent_creation'
      )
    );

    -- If deduction failed due to insufficient credits, log it but don't block
    IF NOT (v_result->>'success')::boolean THEN
      -- Insert a warning notification
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.user_id,
        'warning',
        'Credit Deduction Failed',
        format('Could not deduct credits for agent creation: %s', v_result->>'error'),
        v_result
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_created
  AFTER INSERT ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.handle_agent_created();

-- =============================================
-- 6. Auto-deduct credits when email template is generated
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_email_template_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only process on INSERT (new template creation)
  IF TG_OP = 'INSERT' THEN
    -- Deduct credits for template generation
    v_result := public.deduct_credits_for_action(
      NEW.user_id,
      'generate_template',
      1,  -- quantity
      NEW.id,  -- reference_id (template id)
      jsonb_build_object(
        'template_name', NEW.name,
        'template_id', NEW.id,
        'trigger', 'auto_deduct_template_generation'
      )
    );

    -- If deduction failed due to insufficient credits, log it but don't block
    IF NOT (v_result->>'success')::boolean THEN
      -- Insert a warning notification
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES (
        NEW.user_id,
        'warning',
        'Credit Deduction Failed',
        format('Could not deduct credits for template generation: %s', v_result->>'error'),
        v_result
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_email_template_created
  AFTER INSERT ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_template_created();

-- =============================================
-- 7. Email Import Credit Deduction
-- Note: Email imports should use the batch function manually:
--   SELECT deduct_credits_for_email_import_batch(user_id, email_count);
-- This allows for proper batching (5 credits per 100 emails).
-- Automatic triggers are not recommended for bulk imports.
-- =============================================

-- ============================================================
-- DONE! All triggers are created.
--
-- Summary of what was created across all 4 files:
--
-- 001_drop_everything.sql:
--   - Drops all triggers, functions, policies, tables, enums
--
-- 002_create_schema.sql:
--   - 9 enums (call_status, activity_type, notification_type, etc.)
--   - 20 tables (profiles, bots, calls, wallets, etc.)
--   - Full RLS policies for all tables
--   - Realtime subscriptions for key tables
--
-- 003_create_functions.sql:
--   - 13 RPC functions (add_credits, deduct_call_credits,
--     deactivate_account, reactivate_account, create_invoice,
--     mark_invoice_paid, create_notification, mark_notification_read,
--     mark_all_notifications_read, log_activity,
--     request_account_deactivation, verify_and_deactivate_account,
--     send_email)
--
-- 004_create_triggers.sql:
--   - updated_at auto-updater for 12 tables
--   - Auto-create profile on user signup (with 100 trial credits)
--   - Auto-deduct credits when call completed (1 credit per minute)
--   - Auto-deduct credits when agent is created (5 credits)
--   - Auto-deduct credits when email template is generated (1 credit)
--   - Activity tracking triggers
-- ============================================================
