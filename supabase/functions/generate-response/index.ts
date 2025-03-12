
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface GenerateResponseRequest {
  query: string;
  context: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

// Default system prompt if none is provided
const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant that answers questions based on the provided context. 
If the information to answer the question is not in the context, say "I don't have enough information to answer that question."
If the question is not related to the context, still try to be helpful but make it clear that you're providing general knowledge.
Always be concise, professional, and accurate. Don't make things up.`;

// System prompt addition for empty context
const EMPTY_CONTEXT_ADDITION = `
The user's message doesn't appear to match any specific content in our knowledge base.
If this is a greeting or general question, please respond appropriately.
For greetings, acknowledge the greeting and ask how you can help.
For general questions, provide a helpful response if you can, or politely explain that you need more specific information.`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      query, 
      context, 
      model = 'gpt-4o-mini', 
      temperature = 0.3,
      systemPrompt 
    } = await req.json() as GenerateResponseRequest;

    if (!query) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Query is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Generating response for query: "${query}" with model: ${model}, temperature: ${temperature}`);
    console.log(`Context available: ${context ? 'Yes' : 'No'}`);

    // Use the provided system prompt or fall back to the default
    let finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // If context is empty, add special instructions to handle greetings and general questions
    if (!context || context.trim() === '') {
      finalSystemPrompt += EMPTY_CONTEXT_ADDITION;
    }

    // Prepare the user message - include context only if it exists
    const userMessage = context && context.trim() !== '' 
      ? `Context:\n${context}\n\nQuestion: ${query}`
      : `Question: ${query}`;

    // Call OpenAI API to generate response
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const responseData = await openaiResponse.json();
    const generatedAnswer = responseData.choices[0].message.content;

    return new Response(
      JSON.stringify({
        success: true,
        answer: generatedAnswer,
        model,
        usage: responseData.usage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in generate-response function:', error);
    
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
