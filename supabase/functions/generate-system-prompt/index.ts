
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json() as GenerateSystemPromptRequest;

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

    // Call OpenAI API to generate system prompt
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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

    return new Response(
      JSON.stringify({
        success: true,
        prompt: generatedPrompt
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
