
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

    console.log("API key retrieved, sending test request to OpenAI");
    
    // Make a simple request to OpenAI API to check connection
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, are you working? Please reply with a confirmation.' }
        ],
        max_tokens: 50,
      }),
    });

    // Parse response
    const data = await response.json();
    console.log("Response received from OpenAI:", JSON.stringify(data));

    if (data.error) {
      console.error("OpenAI API returned an error:", data.error);
      return new Response(
        JSON.stringify({ 
          error: data.error, 
          message: "OpenAI API returned an error", 
          success: false 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Success case
    return new Response(
      JSON.stringify({ 
        message: "OpenAI API connection successful", 
        response: data.choices[0].message.content,
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
        message: "Failed to connect to OpenAI API", 
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
