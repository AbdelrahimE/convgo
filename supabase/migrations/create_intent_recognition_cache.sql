-- Create Intent Recognition Cache table for performance optimization
-- This table caches intent recognition results to avoid repeated AI calls for similar messages

-- Create the intent_recognition_cache table
CREATE TABLE public.intent_recognition_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cache key components
    message_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the message content
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    
    -- Original message data
    original_message TEXT NOT NULL,
    message_length INTEGER NOT NULL,
    
    -- Intent recognition results
    recognized_intent VARCHAR(50) NOT NULL, -- The detected intent category
    confidence_score DECIMAL(5,4) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Selected personality
    selected_personality_id UUID REFERENCES public.ai_personalities(id) ON DELETE SET NULL,
    
    -- Alternative intents (for cases where multiple intents are possible)
    alternative_intents JSONB DEFAULT '[]'::jsonb, -- Array of {intent, confidence} objects
    
    -- Classification metadata
    classification_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    processing_time_ms INTEGER, -- Time taken to classify the intent
    
    -- Cache management
    hit_count INTEGER DEFAULT 0, -- How many times this cache entry was used
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_intent_cache_hash ON public.intent_recognition_cache(message_hash);
CREATE INDEX idx_intent_cache_user_instance ON public.intent_recognition_cache(user_id, whatsapp_instance_id);
CREATE INDEX idx_intent_cache_intent ON public.intent_recognition_cache(recognized_intent);
CREATE INDEX idx_intent_cache_expires ON public.intent_recognition_cache(expires_at);
CREATE INDEX idx_intent_cache_last_used ON public.intent_recognition_cache(last_used_at);
CREATE INDEX idx_intent_cache_personality ON public.intent_recognition_cache(selected_personality_id);

-- Unique constraint for message hash per user/instance to prevent duplicates
CREATE UNIQUE INDEX idx_intent_cache_unique_hash 
ON public.intent_recognition_cache(message_hash, user_id, whatsapp_instance_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE public.intent_recognition_cache ENABLE ROW LEVEL SECURITY;

-- Users can only access their own cache entries
CREATE POLICY "Users can view their own intent cache" ON public.intent_recognition_cache
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own intent cache" ON public.intent_recognition_cache
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own intent cache" ON public.intent_recognition_cache
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own intent cache" ON public.intent_recognition_cache
    FOR DELETE USING (user_id = auth.uid());

-- Function to update hit count and last_used_at when cache is accessed
CREATE OR REPLACE FUNCTION increment_intent_cache_hit(cache_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.intent_recognition_cache 
    SET 
        hit_count = hit_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    WHERE id = cache_id;
END;
$$ language 'plpgsql';

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_intent_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.intent_recognition_cache 
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to generate message hash for caching
CREATE OR REPLACE FUNCTION generate_message_hash(message_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Normalize the message for consistent hashing
    -- Convert to lowercase, trim whitespace, remove extra spaces
    RETURN encode(digest(
        lower(trim(regexp_replace(message_text, '\s+', ' ', 'g'))), 
        'sha256'
    ), 'hex');
END;
$$ language 'plpgsql';

-- Add helpful comments
COMMENT ON TABLE public.intent_recognition_cache IS 'Caches intent recognition results to improve performance and reduce AI API calls';
COMMENT ON COLUMN public.intent_recognition_cache.message_hash IS 'SHA-256 hash of normalized message content for fast lookups';
COMMENT ON COLUMN public.intent_recognition_cache.alternative_intents IS 'JSON array of alternative intent classifications with confidence scores';
COMMENT ON COLUMN public.intent_recognition_cache.hit_count IS 'Number of times this cached result was reused';
COMMENT ON COLUMN public.intent_recognition_cache.processing_time_ms IS 'Original processing time in milliseconds for analytics';

-- Create a scheduled job to clean up expired cache entries (requires pg_cron extension)
-- This will be called by a scheduled edge function instead
COMMENT ON FUNCTION cleanup_expired_intent_cache() IS 'Removes expired cache entries to maintain performance and storage efficiency';