
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .select('monthly_ai_response_limit, monthly_ai_responses_used, last_responses_reset_date')
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
    
    // Calculate next reset date - first day of next month
    const currentDate = new Date(lastReset || new Date());
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const nextResetDate = nextMonth.toISOString();

    const allowed = used < limit;
    logger.log(`User ${userId} has used ${used}/${limit} AI responses. Reset date: ${nextResetDate}`);

    return new Response(
      JSON.stringify({
        success: true,
        allowed,
        limit,
        used,
        resetsOn: nextResetDate,
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
