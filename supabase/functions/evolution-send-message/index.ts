
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SendMessageRequest {
  instance: string; // WhatsApp instance ID
  recipient: string; // Recipient phone number
  message: string; // Text message to send
  mediaUrl?: string; // Optional URL for media attachments
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { instance, recipient, message, mediaUrl } = await req.json() as SendMessageRequest;

    // Validate required parameters
    if (!instance || !recipient || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: instance, recipient, or message"
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Normalize phone number format (remove any non-digit characters)
    let normalizedRecipient = recipient.replace(/\D/g, '');
    
    // Ensure number has proper format
    if (!normalizedRecipient.includes('@')) {
      // If recipient doesn't already have @c.us suffix, add it
      normalizedRecipient = `${normalizedRecipient}@c.us`;
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
    console.log(`Sending message to ${normalizedRecipient} via instance ${instance}`);

    // Prepare the request URL
    const baseUrl = evolutionApiUrl.endsWith("/") ? evolutionApiUrl.slice(0, -1) : evolutionApiUrl;
    
    // Determine if we're sending text or media
    let endpointUrl: string;
    let requestBody: Record<string, any>;

    if (mediaUrl) {
      // We're sending media
      endpointUrl = `${baseUrl}/message/sendMedia/${instance}`;
      
      // Determine media type
      const mediaType = determineMediaType(mediaUrl);
      
      requestBody = {
        number: normalizedRecipient,
        options: {
          delay: 1200, // Small delay to prevent rate limiting
          presence: "composing" // Show "typing" status
        },
        mediaUrl: mediaUrl,
        fileName: `attachment.${getFileExtension(mediaUrl)}`,
        mediaType: mediaType,
        caption: message // Use the message as caption
      };
    } else {
      // We're sending text
      endpointUrl = `${baseUrl}/message/sendText/${instance}`;
      
      requestBody = {
        number: normalizedRecipient,
        options: {
          delay: 1200, // Small delay to prevent rate limiting
          presence: "composing" // Show "typing" status
        },
        textMessage: message
      };
    }

    // Send the request to Evolution API
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey
      },
      body: JSON.stringify(requestBody)
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
    console.error("Error sending message:", error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to send message: ${error.message}`
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

// Helper function to determine media type from URL
function determineMediaType(url: string): string {
  const extension = getFileExtension(url).toLowerCase();
  
  // Image types
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
    return 'image';
  }
  
  // Video types
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(extension)) {
    return 'video';
  }
  
  // Audio types
  if (['mp3', 'ogg', 'wav', 'm4a'].includes(extension)) {
    return 'audio';
  }
  
  // Document types
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(extension)) {
    return 'document';
  }
  
  // Default to document for unknown types
  return 'document';
}

// Helper function to extract file extension from URL
function getFileExtension(url: string): string {
  const parts = url.split('/').pop()?.split('?')[0].split('.');
  return parts && parts.length > 1 ? parts.pop() || '' : '';
}
