import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  console.log("Request received:", req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling OPTIONS request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get OpenAI API key from environment
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) {
      console.error("OpenAI API key not found");
      return new Response(
        JSON.stringify({ 
          error: "OpenAI API key not configured", 
          success: false 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log("API key retrieved, sending test request to OpenAI for embeddings");
    
    // Make a request to OpenAI API to test embeddings
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: 'This is a test for embedding generation.',
        encoding_format: 'float'
      }),
    });

    // Parse response
    const data = await response.json();
    console.log("Response received from OpenAI embeddings:", data.model, data.data ? "Embedding generated successfully" : "No embedding data");

    if (data.error) {
      console.error("OpenAI API returned an error:", data.error);
      return new Response(
        JSON.stringify({ 
          error: data.error, 
          message: "OpenAI Embeddings API returned an error", 
          success: false 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Success case - return without the full embedding vector to keep response size reasonable
    return new Response(
      JSON.stringify({ 
        message: "OpenAI Embeddings API connection successful", 
        response: `Embedding generated successfully (${data.data?.[0]?.embedding?.length || 0} dimensions)`,
        model: data.model,
        success: true 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    // Log and return any errors
    console.error("Error in openai-test-connection:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        message: "Failed to connect to OpenAI Embeddings API", 
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
