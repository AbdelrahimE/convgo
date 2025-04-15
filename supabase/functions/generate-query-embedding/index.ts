import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface RequestBody {
  text: string;
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const EMBEDDING_MODEL = 'text-embedding-3-small';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json() as RequestBody;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const apiKey = getNextOpenAIKey();

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: EMBEDDING_MODEL,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return new Response(
      JSON.stringify({
        success: true,
        embedding: embedding,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in generate-query-embedding function:', error);
    
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
})
