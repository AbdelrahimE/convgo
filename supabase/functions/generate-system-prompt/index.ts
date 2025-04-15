
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_URL = 'https://okoaoguvtjauiecfajri.supabase.co';

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface GenerateSystemPromptRequest {
  description: string;
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

// Helper function to extract user ID from JWT token
async function getUserIdFromToken(token: string): Promise<string | null> {
  try {
    // JWT tokens are in the format: header.payload.signature
    // We can extract the payload without verifying the signature for this purpose
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }
    
    // Decode the payload part
    const payload = JSON.parse(atob(parts[1]));
    
    // The sub claim in the JWT contains the user ID
    if (!payload.sub) {
      throw new Error('No user ID found in token');
    }
    
    return payload.sub;
  } catch (error) {
    logger.error('Error extracting user ID from token:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json() as GenerateSystemPromptRequest;
    
    // Get user ID from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Extract user ID from JWT
    const token = authHeader.replace('Bearer ', '');
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      throw new Error('Could not extract user ID from token');
    }
    
    logger.info('Extracted user ID from token:', userId);
    
    // Use service role key to fetch user's profile directly
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!profileResponse.ok) {
      logger.error('Profile response status:', profileResponse.status);
      logger.error('Profile response text:', await profileResponse.text());
      throw new Error(`Failed to get user profile: ${profileResponse.status}`);
    }

    const profiles = await profileResponse.json();
    
    if (!profiles || profiles.length === 0) {
      throw new Error('User profile not found');
    }

    const profile = profiles[0];
    
    logger.info('Successfully retrieved user profile:', { 
      id: profile.id,
      promptGenerationLimit: profile.monthly_prompt_generations_limit,
      promptGenerationsUsed: profile.monthly_prompt_generations_used 
    });

    if (!description) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Description is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Check if user has reached their limit
    if (profile.monthly_prompt_generations_used >= profile.monthly_prompt_generations_limit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Monthly prompt generation limit reached',
          details: {
            limit: profile.monthly_prompt_generations_limit,
            used: profile.monthly_prompt_generations_used,
            resetsOn: profile.last_prompt_generations_reset_date
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      );
    }

    logger.log(`Generating system prompt from description: "${description}"`);

    const apiKey = getNextOpenAIKey();

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `You are a WhatsApp prompt engineering expert. Your task is to convert a user's description of what they want their WhatsApp AI assistant to do into a powerful, effective system prompt.
            
The system prompt should:
1. Be clear, concise, and focused on the specific task
2. Define the assistant's role, tone, and constraints
3. Include necessary instructions or guidelines
4. Be optimized for WhatsApp interactions (which are typically brief)
5. Help the AI understand the context and purpose of the conversation

Create a system prompt that is formatted as a complete, ready-to-use prompt with no preamble, explanations, or meta-commentary.`
          },
          { 
            role: 'user', 
            content: `Convert this description into an effective system prompt for a WhatsApp AI assistant:
            
${description}`
          }
        ],
        temperature: 1.0,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const responseData = await openaiResponse.json();
    const generatedPrompt = responseData.choices[0].message.content.trim();

    // Increment the usage counter
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          monthly_prompt_generations_used: profile.monthly_prompt_generations_used + 1
        })
      }
    );

    if (!updateResponse.ok) {
      logger.error('Failed to update prompt generation count:', await updateResponse.text());
    }

    return new Response(
      JSON.stringify({
        success: true,
        prompt: generatedPrompt,
        promptGeneration: {
          limit: profile.monthly_prompt_generations_limit,
          used: profile.monthly_prompt_generations_used + 1,
          remaining: profile.monthly_prompt_generations_limit - (profile.monthly_prompt_generations_used + 1),
          resetsOn: profile.last_prompt_generations_reset_date
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in generate-system-prompt function:', error);
    
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
