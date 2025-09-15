-- Add response configuration columns to external_actions table
-- This migration adds support for flexible response types in External Actions V2

-- Add response configuration columns
ALTER TABLE public.external_actions ADD COLUMN IF NOT EXISTS
  response_type VARCHAR(30) DEFAULT 'simple_confirmation' 
  CHECK (response_type IN ('none', 'simple_confirmation', 'custom_message', 'wait_for_webhook'));

ALTER TABLE public.external_actions ADD COLUMN IF NOT EXISTS
  confirmation_message TEXT DEFAULT 'Your order has been received successfully';

ALTER TABLE public.external_actions ADD COLUMN IF NOT EXISTS
  wait_for_response BOOLEAN DEFAULT FALSE;

ALTER TABLE public.external_actions ADD COLUMN IF NOT EXISTS
  response_timeout_seconds INTEGER DEFAULT 30
  CHECK (response_timeout_seconds >= 5 AND response_timeout_seconds <= 120);

ALTER TABLE public.external_actions ADD COLUMN IF NOT EXISTS
  response_language VARCHAR(5) DEFAULT 'ar'
  CHECK (response_language IN ('ar', 'en', 'fr', 'es', 'de'));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_external_actions_response_type 
ON public.external_actions (response_type) 
WHERE is_active = true;