-- ============================================================
-- 014_add_test_call_support.sql
-- Adds support for test calls in the calls table
-- ============================================================

-- Add is_test_call column to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS is_test_call boolean DEFAULT false;

-- Create index for test calls
CREATE INDEX IF NOT EXISTS idx_calls_is_test_call ON public.calls(is_test_call) WHERE is_test_call = true;

-- Add comment
COMMENT ON COLUMN public.calls.is_test_call IS 'Indicates if this is a test call from the test agent feature';
