
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Config constants
const EVOLUTION_API_BASE_URL = "https://api.convgo.com/v1/";
const MAX_CACHE_AGE = 3600; // 1 hour in seconds
const VOICE_TIMEOUT = 15000; // 15 seconds timeout for voice transcription

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  webhook_url: string | null;
  status: string;
  user_id: string;
}

interface AIConfig {
  id: string;
  system_prompt: string;
  temperature: number;
  is_active: boolean;
}

// Function to process incoming messages
async function processIncomingMessage(
  instanceName: string,
  senderPhone: string,
  message: string,
  messageType: string,
  mediaUrl?: string,
  mimeType?: string
) {
  console.log(`Processing ${messageType} message from ${senderPhone} for instance ${instanceName}`);
  
  try {
    // Look up the instance in the database
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, user_id, status")
      .eq("instance_name", instanceName)
      .single();

    if (instanceError || !instance) {
      console.error(`Instance not found: ${instanceName}`, instanceError);
      return { success: false, error: "Instance not found" };
    }

    if (instance.status !== "connected") {
      console.error(`Instance not connected: ${instanceName}`);
      return { success: false, error: "Instance not connected" };
    }

    // Check if AI is enabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .eq("whatsapp_instance_id", instance.id)
      .eq("is_active", true)
      .single();

    if (aiConfigError || !aiConfig) {
      console.log(`AI not enabled for instance: ${instanceName}`);
      return { success: false, error: "AI not enabled for this instance" };
    }

    // Find or create a conversation
    const { data: conversation, error: conversationError } = await findOrCreateConversation(
      instance.id,
      senderPhone
    );

    if (conversationError || !conversation) {
      console.error(`Error finding/creating conversation: ${conversationError?.message}`);
      return { success: false, error: "Failed to create conversation" };
    }

    // Save the incoming message
    await supabase.from("whatsapp_conversation_messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: message,
      metadata: {
        type: messageType,
        media_url: mediaUrl || null,
        mime_type: mimeType || null
      }
    });

    // Get the file IDs associated with this WhatsApp instance
    const { data: fileMappings, error: fileMappingsError } = await supabase
      .from("whatsapp_file_mappings")
      .select("file_id")
      .eq("whatsapp_instance_id", instance.id);

    if (fileMappingsError) {
      console.error("Error fetching file mappings:", fileMappingsError);
      return { success: false, error: "Failed to fetch file mappings" };
    }

    if (!fileMappings || fileMappings.length === 0) {
      console.log("No files mapped to this WhatsApp instance");
      // Send a response to the user that no knowledge base is configured
      await sendWhatsAppMessage(instanceName, senderPhone, "I don't have any knowledge base configured to assist you. Please contact the administrator.");
      return { success: false, error: "No files mapped" };
    }

    // Get the file IDs
    const fileIds = fileMappings.map(mapping => mapping.file_id);

    // Generate embeddings for the user query and get relevant content
    const query = message;
    let context = await getRelevantContext(query, fileIds);

    // Generate a response using the RAG approach
    const generateResponse = await supabase.functions.invoke("generate-response", {
      body: {
        query,
        context,
        systemPrompt: aiConfig.system_prompt,
        temperature: aiConfig.temperature || 1.0,
        includeConversationHistory: true,
        conversationId: conversation.id,
        model: "gpt-4o-mini"
      }
    });

    if (generateResponse.error) {
      console.error("Error generating response:", generateResponse.error);
      return { success: false, error: "Failed to generate response" };
    }

    const response = generateResponse.data;
    console.log("Response generated:", { success: response.success });

    if (!response.success) {
      console.error("Failed to generate response:", response.error);
      return { success: false, error: response.error };
    }

    // Save the AI's response to the conversation
    await supabase.from("whatsapp_conversation_messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: response.answer,
      metadata: {
        model: response.model,
        usage: response.usage
      }
    });

    // Track AI interaction for analytics
    await supabase.from("whatsapp_ai_interactions").insert({
      whatsapp_instance_id: instance.id,
      conversation_id: conversation.id,
      input_text: query,
      output_text: response.answer,
      model: response.model,
      token_usage: response.usage.total_tokens,
      metadata: {
        user_phone: senderPhone,
        message_type: messageType,
        usage_breakdown: response.usage
      }
    });

    // Send the response back to the user via WhatsApp
    const sendResult = await sendWhatsAppMessage(instanceName, senderPhone, response.answer);
    if (!sendResult.success) {
      console.error("Failed to send message:", sendResult.error);
      return { success: false, error: "Failed to send response" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in processing message:", error);
    return { success: false, error: "Internal server error" };
  }
}

// Function to handle audio messages
async function processAudioMessage(
  instanceName: string, 
  senderPhone: string, 
  audioUrl: string,
  mimeType: string
) {
  console.log(`Processing audio message from ${senderPhone} for instance ${instanceName}`);
  console.log(`Audio URL: ${audioUrl}`);
  
  try {
    // Transcribe the audio
    const transcribeResult = await transcribeAudio(instanceName, audioUrl, mimeType);
    
    if (!transcribeResult.success) {
      console.error("Failed to transcribe audio:", transcribeResult.error);
      
      // Send a fallback message to the user
      await sendWhatsAppMessage(
        instanceName, 
        senderPhone, 
        "I couldn't understand your voice message. Could you please type your question instead?"
      );
      
      return { success: false, error: "Transcription failed", sent_fallback: true };
    }
    
    console.log("Transcription successful:", transcribeResult.transcription);
    
    // Process the transcribed text using the same pipeline as text messages
    const processResult = await processIncomingMessage(
      instanceName,
      senderPhone,
      transcribeResult.transcription,
      "voice",
      audioUrl,
      mimeType
    );
    
    return processResult;
  } catch (error) {
    console.error("Error processing audio message:", error);
    return { success: false, error: "Audio processing failed" };
  }
}

// Function to transcribe audio using the dedicated edge function
async function transcribeAudio(instanceName: string, audioUrl: string, mimeType: string) {
  try {
    console.log(`Transcribing audio from URL: ${audioUrl}`);
    
    // Call the transcription edge function
    const { data, error } = await supabase.functions.invoke("whatsapp-voice-transcribe", {
      body: {
        audioUrl,
        mimeType,
        instanceName,
        evolutionApiKey
      },
    });
    
    if (error) {
      console.error("Error calling transcription function:", error);
      return { success: false, error: `Transcription service error: ${error.message}` };
    }
    
    if (!data.success) {
      console.error("Transcription failed:", data.error);
      return { success: false, error: data.error || "Unknown transcription error" };
    }
    
    return {
      success: true,
      transcription: data.transcription,
      language: data.language,
      duration: data.duration
    };
  } catch (error) {
    console.error("Exception during transcription:", error);
    return { success: false, error: `Exception: ${error.message}` };
  }
}

// Function to find or create a conversation for a user
async function findOrCreateConversation(instanceId: string, userPhone: string) {
  // Look for an existing conversation
  const { data: existingConversation, error: findError } = await supabase
    .from("whatsapp_conversations")
    .select("id, status")
    .eq("instance_id", instanceId)
    .eq("user_phone", userPhone)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!findError && existingConversation) {
    return { data: existingConversation, error: null };
  }

  // Create a new conversation
  const { data: newConversation, error: createError } = await supabase
    .from("whatsapp_conversations")
    .insert({
      instance_id: instanceId,
      user_phone: userPhone,
      status: "active",
      conversation_data: { created_at: new Date().toISOString() }
    })
    .select()
    .single();

  return { data: newConversation, error: createError };
}

// Function to send a WhatsApp message via EVOLUTION API
async function sendWhatsAppMessage(instanceName: string, phone: string, message: string) {
  try {
    const url = `${EVOLUTION_API_BASE_URL}${instanceName}/message/text`;
    
    const payload = {
      number: phone,
      options: {
        delay: 1200,
        presence: "composing"
      },
      textMessage: {
        text: message
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error sending message: ${response.status} ${errorText}`);
      return { success: false, error: `API error: ${response.status}` };
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Exception sending message:", error);
    return { success: false, error: `Exception: ${error.message}` };
  }
}

// Function to get relevant content from the knowledge base
async function getRelevantContext(query: string, fileIds: string[]) {
  try {
    // Generate embedding for query
    const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke(
      "generate-query-embedding",
      {
        body: { query }
      }
    );
    
    if (embeddingError || !embeddingData?.success) {
      console.error("Error generating query embedding:", embeddingError || embeddingData?.error);
      return "";
    }
    
    // Use the query embedding to search for relevant content in your documents
    const searchQuery = `
      SELECT * FROM match_document_chunks_by_files(
        '${embeddingData.embedding}',
        0.6,
        10,
        20,
        NULL,
        ARRAY[${fileIds.map(id => `'${id}'`).join(',')}]::uuid[]
      );
    `;
    
    const { data: searchResults, error: searchError } = await supabase.rpc(
      "match_document_chunks_by_files",
      {
        query_embedding: embeddingData.embedding,
        match_threshold: 0.6,
        match_count: 10,
        min_content_length: 20,
        filter_language: null,
        file_ids: fileIds
      }
    );
    
    if (searchError) {
      console.error("Error searching documents:", searchError);
      return "";
    }
    
    if (!searchResults || searchResults.length === 0) {
      console.log("No relevant content found");
      return "";
    }

    // Now with the search results, we'll assemble context
    const { data: contextData, error: contextError } = await supabase.functions.invoke("assemble-context", {
      body: {
        results: searchResults,
        maxContextLength: 8000,
        query
      }
    });

    if (contextError || !contextData?.success) {
      console.error("Error assembling context:", contextError || contextData?.error);
      return "";
    }

    return contextData.assembled.context;
  } catch (error) {
    console.error("Error getting relevant context:", error);
    return "";
  }
}

// Webhook status check
async function getWebhookStatus() {
  try {
    // Get all webhook configs from the database
    const { data: webhookConfigs, error: webhookError } = await supabase
      .from("whatsapp_webhook_config")
      .select("*");
    
    if (webhookError) {
      console.error("Error fetching webhook configurations:", webhookError);
      return { success: false, error: webhookError.message };
    }
    
    // Get all instances
    const { data: instances, error: instancesError } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, status");
    
    if (instancesError) {
      console.error("Error fetching instances:", instancesError);
      return { success: false, error: instancesError.message };
    }
    
    // Map instance names to their webhooks if they exist
    const activeWebhooks = webhookConfigs?.map(config => {
      const instance = instances?.find(inst => inst.id === config.whatsapp_instance_id);
      if (instance) {
        return {
          id: config.id,
          instance_id: config.whatsapp_instance_id,
          instance_name: instance.instance_name,
          webhook_url: config.webhook_url,
          is_active: config.is_active,
          last_status: config.last_status,
          last_checked_at: config.last_checked_at
        };
      }
      return null;
    }).filter(Boolean);
    
    return { success: true, activeWebhooks };
  } catch (error) {
    console.error("Error checking webhook status:", error);
    return { success: false, error: "Internal server error" };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const action = params.get("action") || "";
    
    // Check webhook status endpoint
    if (action === "status") {
      const statusResult = await getWebhookStatus();
      return new Response(JSON.stringify(statusResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // Extract payload from the request
    const reqData = await req.json();
    console.log("Webhook received:", JSON.stringify({
      action,
      bodyKeys: Object.keys(reqData),
      url: req.url
    }));
    
    // Handle incoming webhook from EVOLUTION API
    const {
      event,
      instanceName,
      data,
      id,
      sender,
      senderName,
      isFromMe,
      isImage,
      isVideo,
      isAudio,
      isPtt, // Push-to-talk voice message
      mediaUrl,
      caption,
      mimeType,
      conversation
    } = reqData;
    
    if (!event || !instanceName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Filter out messages sent by our own instance (avoid loops)
    if (isFromMe) {
      return new Response(
        JSON.stringify({ success: true, message: "Ignoring message from self" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Handle different event types
    if (event === "messages.upsert") {
      const messageContent = data?.text || caption || "";
      const senderPhone = sender?.split("@")[0] || "";
      
      if (!senderPhone) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid sender phone number" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let result;
      
      // Handle different message types
      if (isAudio || isPtt) {
        // Voice message handling
        if (!mediaUrl) {
          console.error("Audio message without media URL");
          return new Response(
            JSON.stringify({ success: false, error: "Missing media URL for audio" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Process audio message with transcription
        result = await processAudioMessage(
          instanceName,
          senderPhone,
          mediaUrl,
          mimeType || "audio/ogg; codecs=opus"
        );
      } else if (messageContent) {
        // Process regular text message
        result = await processIncomingMessage(
          instanceName,
          senderPhone,
          messageContent,
          "text"
        );
      } else {
        // Unsupported message type (images, videos, etc.)
        console.log("Unsupported message type received:", { isImage, isVideo });
        return new Response(
          JSON.stringify({ success: true, message: "Unsupported message type" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Default response for unhandled events
    return new Response(
      JSON.stringify({ success: true, message: "Event received but not processed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error in webhook handler:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Server error: ${error.message}`
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
