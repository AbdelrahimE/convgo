
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays } from "https://esm.sh/date-fns@3.6.0";

// Simple logger for edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.warn(...args),
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface CheckAIUsageLimitRequest {
  userId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json() as CheckAIUsageLimitRequest;

    if (!userId) {
      logger.error('Missing user ID in request');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User ID is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    logger.log(`Checking AI usage for user: ${userId}`);

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        monthly_ai_response_limit,
        monthly_ai_responses_used,
        last_responses_reset_date,
        storage_limit_mb,
        storage_used_mb,
        instance_limit,
        subscription_start_date,
        subscription_end_date,
        plan_type,
        subscription_period
      `)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching user profile:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Error fetching user profile' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    if (!profile) {
      logger.error('Profile not found for user ID:', userId);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User profile not found' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    const limit = profile.monthly_ai_response_limit || 0;
    const used = profile.monthly_ai_responses_used || 0;
    const lastReset = profile.last_responses_reset_date;
    
    // Calculate next reset date - 30 days after the last reset
    const lastResetDate = new Date(lastReset || new Date());
    const nextResetDate = addDays(lastResetDate, 30).toISOString();

    const allowed = used < limit;
    logger.log(`User ${userId} has used ${used}/${limit} AI responses. Reset date: ${nextResetDate}`);

    return new Response(
      JSON.stringify({
        success: true,
        allowed,
        limit,
        used,
        resetsOn: lastReset,  // Send the original last reset date, not the calculated next reset
        storageLimitMb: profile.storage_limit_mb || 50,
        storageUsedMb: profile.storage_used_mb || 0,
        instanceLimit: profile.instance_limit || 1,
        subscriptionStartDate: profile.subscription_start_date,
        subscriptionEndDate: profile.subscription_end_date,
        planType: profile.plan_type,
        subscriptionPeriod: profile.subscription_period,
        errorMessage: !allowed ? `Monthly AI response limit reached (${used}/${limit})` : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in check-ai-usage-limit function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
