-- ============================================================
-- CREDIT SYSTEM UPDATES
-- Run these commands to add the credit deduction system
-- ============================================================

-- 1. CREATE CREDIT_COSTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_costs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type      text NOT NULL UNIQUE,
  action_name      text NOT NULL,
  cost_per_unit    numeric NOT NULL DEFAULT 0,
  unit_description text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_costs_action_type ON public.credit_costs(action_type);
CREATE INDEX IF NOT EXISTS idx_credit_costs_is_active ON public.credit_costs(is_active);

ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_costs_select_all" ON public.credit_costs
  FOR SELECT USING (is_active = true);

-- 2. GENERIC CREDIT DEDUCTION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_credits_for_action(
  p_user_id          uuid,
  p_action_type      text,
  p_quantity         numeric DEFAULT 1,
  p_reference_id     uuid DEFAULT NULL,
  p_metadata         jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_per_unit    numeric;
  v_action_name      text;
  v_total_cost       numeric;
  v_balance_before   numeric;
  v_balance_after    numeric;
  v_log_id           uuid;
BEGIN
  SELECT cost_per_unit, action_name
    INTO v_cost_per_unit, v_action_name
    FROM credit_costs
   WHERE action_type = p_action_type
     AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('No active credit cost found for action type: %s', p_action_type)
    );
  END IF;

  v_total_cost := v_cost_per_unit * p_quantity;

  SELECT COALESCE("Remaning_credits", 0)
    INTO v_balance_before
    FROM profiles
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF v_balance_before < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient credits. Required: %s, Available: %s', v_total_cost, v_balance_before),
      'required', v_total_cost,
      'available', v_balance_before,
      'action_type', p_action_type,
      'action_name', v_action_name
    );
  END IF;

  v_balance_after := v_balance_before - v_total_cost;

  UPDATE profiles
     SET "Remaning_credits" = v_balance_after,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO credit_usage_logs (
    user_id, usage_type, amount_used,
    balance_before, balance_after, cost_breakdown
  ) VALUES (
    p_user_id, 'other', v_total_cost,
    v_balance_before, v_balance_after,
    jsonb_build_object(
      'action_type', p_action_type,
      'action_name', v_action_name,
      'cost_per_unit', v_cost_per_unit,
      'quantity', p_quantity,
      'total_cost', v_total_cost,
      'reference_id', p_reference_id,
      'metadata', p_metadata
    )
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'credits_deducted', v_total_cost,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'action_type', p_action_type,
    'action_name', v_action_name,
    'log_id', v_log_id
  );
END;
$$;

-- 3. SPECIFIC DEDUCTION FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_credits_for_email_send(
  p_user_id      uuid,
  p_email_id     uuid DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.deduct_credits_for_action(
    p_user_id,
    'send_email',
    1,
    p_email_id,
    jsonb_build_object('trigger', 'manual_email_send', 'metadata', p_metadata)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_for_prompt_formatting(
  p_user_id      uuid,
  p_prompt_id    uuid DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.deduct_credits_for_action(
    p_user_id,
    'prompt_formatting',
    1,
    p_prompt_id,
    jsonb_build_object('trigger', 'manual_prompt_formatting', 'metadata', p_metadata)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_for_prompt_generation(
  p_user_id      uuid,
  p_prompt_id    uuid DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.deduct_credits_for_action(
    p_user_id,
    'prompt_generation',
    1,
    p_prompt_id,
    jsonb_build_object('trigger', 'manual_prompt_generation', 'metadata', p_metadata)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_for_email_import_batch(
  p_user_id      uuid,
  p_email_count  integer,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batches numeric;
BEGIN
  v_batches := CEIL(p_email_count::numeric / 100.0);
  
  RETURN public.deduct_credits_for_action(
    p_user_id,
    'import_emails',
    v_batches,
    NULL,
    jsonb_build_object(
      'trigger', 'manual_email_import_batch',
      'email_count', p_email_count,
      'batches', v_batches,
      'metadata', p_metadata
    )
  );
END;
$$;

-- 4. AUTO-DEDUCTION TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_agent_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_result := public.deduct_credits_for_action(
      NEW.user_id,
      'create_agent',
      1,
      NEW.id,
      jsonb_build_object(
        'bot_name', NEW.name,
        'bot_id', NEW.id,
        'trigger', 'auto_deduct_agent_creation'
      )
    );

    IF NOT (v_result->>'success')::boolean THEN
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

CREATE OR REPLACE FUNCTION public.handle_email_template_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_result := public.deduct_credits_for_action(
      NEW.user_id,
      'generate_template',
      1,
      NEW.id,
      jsonb_build_object(
        'template_name', NEW.name,
        'template_id', NEW.id,
        'trigger', 'auto_deduct_template_generation'
      )
    );

    IF NOT (v_result->>'success')::boolean THEN
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

CREATE TRIGGER set_credit_costs_updated_at
  BEFORE UPDATE ON public.credit_costs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- 5. SEED DEFAULT CREDIT COSTS
-- ============================================================
INSERT INTO public.credit_costs (action_type, action_name, cost_per_unit, unit_description, is_active)
VALUES
  ('create_agent', 'Create Agent', 5, 'per agent', true),
  ('prompt_formatting', 'Prompt Formatting', 1, 'per formatting operation', true),
  ('prompt_generation', 'Prompt Generation', 2, 'per generation', true),
  ('generate_template', 'Generate Email Template', 1, 'per template', true),
  ('send_email', 'Send Email', 0.5, 'per email', true),
  ('import_emails', 'Import Emails', 5, 'per 100 emails', true),
  ('agent_call_runtime', 'Agent Call Runtime', 1, 'per minute', true)
ON CONFLICT (action_type) DO UPDATE
SET 
  action_name = EXCLUDED.action_name,
  cost_per_unit = EXCLUDED.cost_per_unit,
  unit_description = EXCLUDED.unit_description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 6. UPDATE TRIAL CREDITS IN SIGNUP TRIGGER
-- ============================================================
-- Update the handle_new_user function to grant 100 credits
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
    0,
    0,
    100,  -- 100 free trial credits
    false,
    'unpaid',
    now() + interval '7 days',
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
