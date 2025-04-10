import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkForDuplicateMessage } from "./duplicate-message-detector.ts";
import { isConnectionStatusEvent } from "./connection-event-detector.ts";
import { storeMessageInConversation } from "./conversation-storage.ts";
import logDebug from '@/utils/webhook-logger';
import logger from '@/utils/logger';
import { findOrCreateConversation } from "./conversation-finder.ts";

// Define the structure of the webhook data
export interface WebhookData {
  event: string;
  instance: string;
  data: any;
}

// Define the structure for the AI response
interface AIResponse {
  response: string;
  sources: string[];
  instance_id?: string;
  ai_limit_exceeded?: boolean;
}

/**
 * Core logic to handle support escalation via WhatsApp
 * @param webhookData The data received from the webhook
 * @param supabaseUrl The Supabase URL
 * @param supabaseAnonKey The Supabase Anon Key
 * @param evolutionApiUrl The Evolution API URL
 * @param evolutionApiKey The Evolution API Key
 * @param supabaseServiceKey The Supabase Service Role Key
 * @param foundInstanceId Optional instance ID if already found
 * @param transcribedText Optional transcribed text from voice message
 * @returns Promise<any>
 */
export async function handleSupportEscalation(
  webhookData: WebhookData,
  supabaseUrl: string,
  supabaseAnonKey: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  supabaseServiceKey: string,
  foundInstanceId?: string | null,
  transcribedText?: string | null
): Promise<any> {
  // Initialize Supabase clients
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  });

  // Log the webhook data for debugging
  await logDebug('WEBHOOK_RECEIVED', 'Received webhook event', webhookData);

  // Respond immediately for connection status events
  if (isConnectionStatusEvent(webhookData)) {
    logger.info('Connection status event, skipping AI processing.');
    return { success: true, message: 'Connection status event processed.' };
  }

  // Destructure data from the webhook payload
  const { event, instance, data } = webhookData;

  // Extract relevant information from the webhook data
  const messageId = data?.messages?.[0]?.id;
  const userPhone = data?.messages?.[0]?.author;
  const messageType = data?.messages?.[0]?.type;
  const messageContent = transcribedText || data?.messages?.[0]?.body;

  // Check if required data is present
  if (!messageId || !userPhone) {
    logger.warn('Missing messageId or userPhone in webhook data.');
    return { success: false, error: 'Missing messageId or userPhone in webhook data' };
  }

  // Check for an already found instance ID
  const instanceId = foundInstanceId || instance;

  // Validate configuration
  if (!supabaseUrl || !supabaseAnonKey || !evolutionApiUrl || !evolutionApiKey) {
    logger.error('Missing required environment variables.');
    return { success: false, error: 'Missing required environment variables' };
  }

  try {
    // Check for duplicate messages
    const isDuplicate = await checkForDuplicateMessage(userPhone, messageContent, supabaseAdmin);
    if (isDuplicate) {
      logger.warn('Duplicate message detected, skipping AI processing.');
      return { success: true, message: 'Duplicate message detected, skipping AI processing.' };
    }

    // Find or create a conversation
    const { conversationId, isNew } = await findOrCreateConversation(userPhone, instanceId, supabaseAdmin);

    // Store the incoming message in the conversation
    await storeMessageInConversation(conversationId, 'user', messageContent, messageId, supabaseAdmin);

    // Fetch conversation history
    const { data: conversationHistory, error: conversationError } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (conversationError) {
      logger.error('Error fetching conversation history:', conversationError);
      throw conversationError;
    }

    // Format conversation history for AI
    const formattedHistory = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');

    // Construct the payload for the AI API
    const aiPayload = {
      instance_id: instanceId,
      user_phone: userPhone,
      message: messageContent,
      history: formattedHistory,
      message_type: messageType
    };

    // Log AI payload
    await logDebug('AI_PAYLOAD', 'Payload sent to AI', aiPayload);

    // Call the AI API
    const aiResponse = await fetch(evolutionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${evolutionApiKey}`
      },
      body: JSON.stringify(aiPayload)
    });

    // Check if the AI request was successful
    if (!aiResponse.ok) {
      // Check for AI limit exceeded (429 status)
      if (aiResponse.status === 429) {
        logger.warn('AI usage limit exceeded.');
        return { success: false, ai_limit_exceeded: true, error: 'AI usage limit exceeded' };
      }

      // Handle other AI errors
      const errorData = await aiResponse.json();
      logger.error('Error from AI API:', errorData);
      throw new Error(`AI API error: ${JSON.stringify(errorData)}`);
    }

    const aiData: AIResponse = await aiResponse.json();

    // Log AI response
    await logDebug('AI_RESPONSE', 'Response from AI', aiData);

    // Store the AI response in the conversation
    await storeMessageInConversation(conversationId, 'assistant', aiData.response, undefined, supabaseAdmin);

    // Respond to the WhatsApp user
    const responsePayload = {
      instance_id: instanceId,
      phone: userPhone,
      message: aiData.response
    };

    // Log WhatsApp response payload
    await logDebug('WHATSAPP_PAYLOAD', 'Payload sent to WhatsApp', responsePayload);

    const whatsappResponse = await fetch(`${evolutionApiUrl}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${evolutionApiKey}`
      },
      body: JSON.stringify(responsePayload)
    });

    // Check if the WhatsApp request was successful
    if (!whatsappResponse.ok) {
      const errorData = await whatsappResponse.json();
      logger.error('Error sending message to WhatsApp:', errorData);
      throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`);
    }

    const whatsappData = await whatsappResponse.json();

    // Log WhatsApp response
    await logDebug('WHATSAPP_RESPONSE', 'Response from WhatsApp', whatsappData);

    // Update conversation metadata
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        last_activity: new Date().toISOString(),
        conversation_data: {
          context: {
            last_update: new Date().toISOString(),
            ai_sources: aiData.sources,
            ai_instance_id: aiData.instance_id
          }
        }
      })
      .eq('id', conversationId);

    return { success: true, data: { aiData, whatsappData } };

  } catch (error: any) {
    logger.error('Error in handleSupportEscalation:', error);
    return { success: false, error: error.message };
  }
}
