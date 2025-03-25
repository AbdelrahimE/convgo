
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { instance } = await req.json();

    // Validate required parameters
    if (!instance) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameter: instance"
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Get the Evolution API URL and key from environment
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Evolution API configuration: URL or API Key"
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Log the outgoing request details
    console.log(`Fetching instance info for ${instance}`);

    // Prepare the request URL
    const baseUrl = evolutionApiUrl.endsWith("/") ? evolutionApiUrl.slice(0, -1) : evolutionApiUrl;
    const endpointUrl = `${baseUrl}/instance/connectionState/${instance}`;

    // Send the request to Evolution API
    const response = await fetch(endpointUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey
      }
    });

    // Get the response from Evolution API
    const responseData = await response.json();

    // Log the response
    console.log("Evolution API response:", JSON.stringify(responseData));

    // Return a proper response
    return new Response(
      JSON.stringify({
        success: response.ok,
        data: responseData
      }),
      { 
        status: response.ok ? 200 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    // Log and handle any errors
    console.error("Error fetching instance info:", error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to fetch instance info: ${error.message}`
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
