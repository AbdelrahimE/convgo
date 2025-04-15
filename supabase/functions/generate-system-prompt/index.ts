import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

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
    
    // Use service role key to fetch user information
    const userResponse = await fetch(`${SUPABASE_URL}/rest/v1/auth/users?apikey=${SUPABASE_SERVICE_ROLE_KEY}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user information');
    }

    const userData = await userResponse.json();
    const userId = userData[0].id; // Assuming the first user in the response

    // Check user's prompt generation limit
    const profileResponse = await fetch(
      'https://okoaoguvtjauiecfajri.supabase.co/rest/v1/profiles?id=eq.' + userId,
      {
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
      }
    );

    if (!profileResponse.ok) {
      throw new Error('Failed to check prompt generation limit');
    }

    const [profile] = await profileResponse.json();
    
    if (!profile) {
      throw new Error('User profile not found');
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
      'https://okoaoguvtjauiecfajri.supabase.co/rest/v1/profiles?id=eq.' + userId,
      {
        method: 'PATCH',
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
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
