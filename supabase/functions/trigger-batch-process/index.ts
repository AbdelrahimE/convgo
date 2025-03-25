
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Call the process-message-batches function
    const batchProcessUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-message-batches`;
    
    console.log(`Manually triggering batch process at: ${batchProcessUrl}`);
    
    const response = await fetch(batchProcessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        trigger_source: "manual_invocation"
      })
    });

    // Get the response text
    let responseText;
    try {
      responseText = await response.text();
    } catch (error) {
      responseText = "Unable to read response text";
    }

    // Log the response
    console.log(`Batch process response status: ${response.status}`);
    console.log(`Batch process response: ${responseText.substring(0, 500)}`); // Truncate long responses

    // Return the result
    return new Response(
      JSON.stringify({
        success: response.ok,
        status: response.status,
        response: responseText
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: response.ok ? 200 : 500,
      }
    );
  } catch (error) {
    console.error("Error triggering batch process:", error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
