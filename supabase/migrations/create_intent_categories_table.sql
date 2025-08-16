-- Create Intent Categories table for dynamic intent management
-- This table defines the different types of customer inquiries the system can recognize

-- Create the intent_categories table
CREATE TABLE public.intent_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Category identification
    category_key VARCHAR(50) NOT NULL, -- e.g., 'customer-support', 'sales', 'technical'
    display_name VARCHAR(100) NOT NULL, -- e.g., 'Customer Support', 'Sales Inquiries'
    description TEXT,
    
    -- Intent recognition patterns and keywords
    keywords JSONB DEFAULT '[]'::jsonb, -- Array of keywords that help identify this intent
    example_phrases JSONB DEFAULT '[]'::jsonb, -- Example phrases for training/reference
    
    -- AI classification prompt for this category
    classification_prompt TEXT, -- Specific prompt to help AI recognize this intent
    
    -- Category settings
    is_active BOOLEAN DEFAULT true,
    confidence_threshold DECIMAL(3,2) DEFAULT 0.6, -- Minimum confidence to match this intent
    
    -- System vs custom categories
    is_system_category BOOLEAN DEFAULT false, -- Pre-built system categories
    
    -- Analytics and optimization
    match_count INTEGER DEFAULT 0, -- How often this intent is matched
    avg_confidence DECIMAL(3,2) DEFAULT 0.0, -- Average confidence when matched
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_intent_categories_user ON public.intent_categories(user_id);
CREATE INDEX idx_intent_categories_active ON public.intent_categories(is_active) WHERE is_active = true;
CREATE INDEX idx_intent_categories_system ON public.intent_categories(is_system_category) WHERE is_system_category = true;
CREATE INDEX idx_intent_categories_key ON public.intent_categories(category_key);
CREATE INDEX idx_intent_categories_keywords ON public.intent_categories USING GIN(keywords);

-- Ensure unique category keys per user
CREATE UNIQUE INDEX idx_intent_categories_unique_key 
ON public.intent_categories(user_id, category_key) 
WHERE is_system_category = false;

-- System categories have globally unique keys
CREATE UNIQUE INDEX idx_intent_categories_system_unique 
ON public.intent_categories(category_key) 
WHERE is_system_category = true;

-- Add RLS (Row Level Security) policies
ALTER TABLE public.intent_categories ENABLE ROW LEVEL SECURITY;

-- Users can only access their own categories
CREATE POLICY "Users can view their own intent categories" ON public.intent_categories
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own intent categories" ON public.intent_categories
    FOR INSERT WITH CHECK (user_id = auth.uid() AND is_system_category = false);

CREATE POLICY "Users can update their own intent categories" ON public.intent_categories
    FOR UPDATE USING (user_id = auth.uid() AND is_system_category = false);

CREATE POLICY "Users can delete their own intent categories" ON public.intent_categories
    FOR DELETE USING (user_id = auth.uid() AND is_system_category = false);

-- Allow access to system categories for all users
CREATE POLICY "Users can view system intent categories" ON public.intent_categories
    FOR SELECT USING (is_system_category = true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_intent_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_intent_categories_updated_at
    BEFORE UPDATE ON public.intent_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_intent_categories_updated_at();

-- Insert default system intent categories
INSERT INTO public.intent_categories (
    user_id, category_key, display_name, description, keywords, example_phrases, 
    classification_prompt, is_system_category, confidence_threshold
) VALUES 
-- Customer Support Intent
(
    '00000000-0000-0000-0000-000000000000'::uuid, -- System user ID placeholder
    'customer-support',
    'Customer Support',
    'General customer service inquiries, complaints, and support requests',
    '["help", "support", "problem", "issue", "complaint", "assistance", "trouble", "broken", "not working", "error"]'::jsonb,
    '["I need help with...", "I have a problem with...", "Can you assist me?", "Something is not working", "I want to complain about..."]'::jsonb,
    'This message appears to be a customer support request. Look for keywords indicating problems, requests for help, complaints, or general assistance needs.',
    true,
    0.6
),
-- Sales Inquiry Intent  
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'sales',
    'Sales Inquiries',
    'Product information, pricing, purchase inquiries, and sales-related questions',
    '["price", "cost", "buy", "purchase", "order", "product", "service", "package", "plan", "subscription", "discount", "offer"]'::jsonb,
    '["How much does this cost?", "I want to buy...", "What are your prices?", "Can I order...?", "Tell me about your products"]'::jsonb,
    'This message appears to be a sales inquiry. Look for keywords related to pricing, purchasing, products, or commercial interest.',
    true,
    0.6
),
-- Technical Support Intent
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'technical',
    'Technical Support',
    'Technical problems, software issues, troubleshooting, and technical guidance',
    '["technical", "software", "app", "website", "login", "password", "installation", "setup", "configuration", "bug", "crash", "freeze"]'::jsonb,
    '["The app is crashing", "I can''t log in", "How do I install...?", "The website is not loading", "I''m having technical issues"]'::jsonb,
    'This message appears to be a technical support request. Look for keywords related to software, technical problems, installations, or system issues.',
    true,
    0.7
),
-- Billing Intent
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'billing',
    'Billing & Payments',
    'Payment issues, billing questions, invoices, and financial inquiries',
    '["payment", "billing", "invoice", "charge", "refund", "money", "paid", "credit card", "subscription", "renewal", "cancel"]'::jsonb,
    '["I was charged incorrectly", "Where is my invoice?", "I want a refund", "Payment problem", "Cancel my subscription"]'::jsonb,
    'This message appears to be about billing or payments. Look for keywords related to money, charges, invoices, or financial transactions.',
    true,
    0.7
),
-- General Information Intent
(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'general',
    'General Information',
    'General questions, greetings, and informational requests',
    '["hello", "hi", "info", "information", "about", "what", "how", "when", "where", "contact", "hours", "location"]'::jsonb,
    '["Hello", "What are your business hours?", "Where are you located?", "Tell me about your company", "How can I contact you?"]'::jsonb,
    'This message appears to be a general inquiry or greeting. Look for basic questions, greetings, or requests for general information.',
    true,
    0.5
);

-- Add helpful comments
COMMENT ON TABLE public.intent_categories IS 'Defines different types of customer inquiries for intelligent personality routing';
COMMENT ON COLUMN public.intent_categories.keywords IS 'JSON array of keywords that help identify this intent category';
COMMENT ON COLUMN public.intent_categories.example_phrases IS 'JSON array of example phrases for training and reference';
COMMENT ON COLUMN public.intent_categories.classification_prompt IS 'AI prompt specifically designed to help classify this intent category';
COMMENT ON COLUMN public.intent_categories.confidence_threshold IS 'Minimum confidence score required to match this intent (0.0-1.0)';