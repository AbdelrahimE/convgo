-- Create external_action_responses table
-- This table stores pending webhook responses for External Actions V2

-- Store pending webhook responses
CREATE TABLE public.external_action_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_log_id UUID NOT NULL REFERENCES external_action_logs(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  user_phone VARCHAR(20) NOT NULL,
  instance_name VARCHAR(100) NOT NULL,
  response_received BOOLEAN DEFAULT FALSE,
  response_message TEXT,
  response_data JSONB,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for quick lookup of pending responses
CREATE INDEX idx_pending_responses ON public.external_action_responses (execution_log_id, response_received);

-- Index for expired responses cleanup
CREATE INDEX idx_expired_responses ON public.external_action_responses (expires_at) 
WHERE response_received = false;