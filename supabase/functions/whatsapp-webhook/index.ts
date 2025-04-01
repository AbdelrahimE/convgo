import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { handleSupportEscalation } from "../_shared/escalation-utils.ts";

// Create a logger utility
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || '';
const WHATSAPP_BUSINESS_ID = Deno.env.get('WHATSAPP_BUSINESS_ID') || '';

// Main function to handle webhook requests
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract the webhook payload from the request
    const webhookData = await req.json();

    // Log the received webhook data for debugging purposes
    logger.log("[WEBHOOK_RECEIVED]", "Received webhook", {
      instance: webhookData.instance,
      event: webhookData.event,
      remoteJid: webhookData.data?.key?.remoteJid,
      messageType: Object.keys(webhookData.data?.message || {}),
    });

    // Ensure we have a Supabase client
    const supabaseAdmin = supabaseUrl && supabaseAnonKey ?
      createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
        auth: {
          persistSession: false
        }
      }) : null;

    if (!supabaseAdmin) {
      logger.error("Supabase URL or Anon Key missing, can't access Supabase");
      return new Response(
        JSON.stringify({ success: false, error: "Supabase configuration missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract instance information from the webhook payload
    const instanceName = webhookData.instance;
    const remoteJid = webhookData.data?.key?.remoteJid;
    const message = webhookData.data?.message;
    const messageType = Object.keys(message || {})[0];
    const messageText = message?.conversation || message?.extendedTextMessage?.text || '';

    // Check URL parameters for already found instance ID and transcribed text
    const url = new URL(req.url);
    const instanceId = url.searchParams.get('foundInstanceId');
    const transcribedText = url.searchParams.get('transcribedText');

    // Log received webhook
    logger.log(`[WEBHOOK] ${webhookData.event} from ${remoteJid} (${messageType}): ${messageText.substring(0, 50)}...`);

    // Store webhook in database
    try {
      const { error: webhookError } = await supabaseAdmin
        .from('whatsapp_webhooks')
        .insert({
          instance: instanceName,
          event: webhookData.event,
          data: webhookData,
          remoteJid: remoteJid,
          messageType: messageType,
          messageText: messageText,
          instance_id: instanceId
        });

      if (webhookError) {
        logger.error("Failed to store webhook in database:", webhookError);
      } else {
        logger.log("Webhook stored in database");
      }
    } catch (databaseError) {
      logger.error("Error storing webhook in database:", databaseError);
    }

    // Support escalation check
    // Check if the message should be escalated to human support
    // Use the existing implementation, but capture the return value which now includes userId
    const escalationResult = await handleSupportEscalation(
      webhookData,
      supabaseUrl,
      supabaseAnonKey,
      evolutionApiUrl,
      evolutionApiKey,
      supabaseServiceRoleKey,
      instanceId,
      transcribedText
    );

    // Log the result of the escalation check
    logger.log("[SUPPORT_ESCALATION_RESULT]", "Support escalation check result", {
      success: escalationResult.success,
      action: escalationResult.action,
      escalated: escalationResult.action === 'escalated',
      skipAi: escalationResult.skip_ai_processing,
      usedTranscribedText: !!transcribedText
    });

    // If the message should be escalated, skip AI processing
    if (escalationResult.skip_ai_processing) {
      return new Response(
        JSON.stringify({ success: true, ...escalationResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If the message should not be escalated, process it with the AI
    logger.log("[AI_PROCESS_ATTEMPT]", "Attempting to process message for AI response");

    // Extract the user ID that was added to the escalation result
    // This is the instance owner's user ID that will be used to track AI usage
    const instanceUserId = escalationResult.userId;
    
    // Extract relevant information from the webhook data
    const incomingMessage = webhookData.data.message.conversation || webhookData.data.message.extendedTextMessage?.text || '';
    const userPhoneNumber = webhookData.data.key.remoteJid.split('@')[0];

    // Get conversation history
    const { data: conversationHistory, error: conversationError } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content')
      .eq('user_phone', userPhoneNumber)
      .order('created_at', { ascending: false })
      .limit(5);

    if (conversationError) {
      logger.error('Error fetching conversation history:', conversationError);
    }

    const formattedHistory = conversationHistory
      ? conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')
      : '';

    // Call the generate AI response function
    const aiResponseResult = await supabaseAdmin.functions.invoke('generate-response', {
      body: {
        query: incomingMessage,
        context: formattedHistory,
        conversationId: userPhoneNumber,
        userId: instanceUserId
      }
    });

    if (aiResponseResult.error) {
      logger.error("Failed to generate AI response:", aiResponseResult.error);
      return new Response(
        JSON.stringify({ success: false, error: aiResponseResult.error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiResponse = aiResponseResult.data.answer;

    // Store interaction in database
    try {
      await supabaseAdmin
        .from('whatsapp_conversation_messages')
        .insert({
          user_phone: userPhoneNumber,
          role: 'user',
          content: incomingMessage,
        });

      await supabaseAdmin
        .from('whatsapp_conversation_messages')
        .insert({
          user_phone: userPhoneNumber,
          role: 'assistant',
          content: aiResponse,
        });

      logger.log("Interaction stored in database");
    } catch (databaseError) {
      logger.error("Error storing interaction in database:", databaseError);
    }

    // Send the AI response back to the user
    try {
      const apiUrl = `${evolutionApiUrl}/message/sendText/${instanceName}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify({
          number: userPhoneNumber,
          text: aiResponse
        })
      });

      if (!response.ok) {
        logger.error('Failed to send AI response:', await response.text());
      } else {
        logger.log('Sent AI response to user');
      }
    } catch (err) {
      logger.error('Error sending AI response:', err);
    }

    // Return a response indicating success
    return new Response(
      JSON.stringify({ success: true, message: "Message processed successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    logger.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
