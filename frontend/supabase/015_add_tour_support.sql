-- Migration: Add tour support to profiles table
-- This adds a field to track if a user has completed the onboarding tour

-- Add tour_completed field to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tour_completed boolean DEFAULT false;

-- Create index for tour_completed for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_tour_completed ON public.profiles(tour_completed);

-- Update existing users to have tour_completed = false so they can see the tour
UPDATE public.profiles
SET tour_completed = false
WHERE tour_completed IS NULL;
