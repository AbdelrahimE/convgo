-- Customer Profiles Table Schema
-- This table stores customer information and conversation summaries
-- to maintain context across long conversations

CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_instance_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  
  -- Basic information
  name TEXT,
  email TEXT,
  company TEXT,
  
  -- Customer status
  customer_stage TEXT DEFAULT 'new' CHECK (customer_stage IN ('new', 'interested', 'customer', 'loyal')),
  tags TEXT[] DEFAULT '{}', -- ['vip', 'wholesale', 'retail']
  
  -- Automatic summary
  conversation_summary TEXT, -- Latest summary of conversations
  key_points JSONB DEFAULT '[]', -- Important points from all conversations
  preferences JSONB DEFAULT '{}', -- Discovered customer preferences
  
  -- Communication info
  last_interaction TIMESTAMP WITH TIME ZONE,
  first_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_messages INTEGER DEFAULT 0,
  ai_interactions INTEGER DEFAULT 0,
  
  -- AI-extracted insights
  customer_intent TEXT CHECK (customer_intent IN ('purchase', 'inquiry', 'support', 'complaint', 'comparison')),
  customer_mood TEXT CHECK (customer_mood IN ('happy', 'frustrated', 'neutral', 'excited', 'confused')),
  urgency_level TEXT DEFAULT 'normal' CHECK (urgency_level IN ('urgent', 'high', 'normal', 'low')),
  communication_style TEXT CHECK (communication_style IN ('formal', 'friendly', 'direct', 'detailed')),
  journey_stage TEXT CHECK (journey_stage IN ('first_time', 'researching', 'ready_to_buy', 'existing_customer')),
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  UNIQUE(whatsapp_instance_id, phone_number)
);

-- Indexes for fast lookups
CREATE INDEX idx_customer_profiles_phone ON customer_profiles(phone_number);
CREATE INDEX idx_customer_profiles_instance ON customer_profiles(whatsapp_instance_id);
CREATE INDEX idx_customer_profiles_stage ON customer_profiles(customer_stage);
CREATE INDEX idx_customer_profiles_last_interaction ON customer_profiles(last_interaction DESC);
CREATE INDEX idx_customer_profiles_instance_phone ON customer_profiles(whatsapp_instance_id, phone_number);

-- Indexes for AI insights
CREATE INDEX idx_customer_profiles_intent ON customer_profiles(customer_intent);
CREATE INDEX idx_customer_profiles_mood ON customer_profiles(customer_mood);
CREATE INDEX idx_customer_profiles_urgency ON customer_profiles(urgency_level);
CREATE INDEX idx_customer_profiles_journey ON customer_profiles(journey_stage);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION handle_customer_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_customer_profiles_updated_at();

-- RLS Policies to ensure data isolation per user
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own customer profiles" ON customer_profiles
  FOR ALL USING (
    whatsapp_instance_id IN (
      SELECT id FROM whatsapp_instances WHERE user_id = auth.uid()
    )
  );