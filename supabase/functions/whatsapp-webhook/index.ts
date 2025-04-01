import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processRichMessageFormat } from "../_shared/escalation-utils.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

const EVOLUTION_API_BASE_URL = Deno.env.get('EVOLUTION_API_BASE_URL') || '';
const DB_WEBHOOK_SECRET = Deno.env.get('DB_WEBHOOK_SECRET') || '';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function extractInstanceNameFromPayload(webhookData: any): string | null {
  try {
    return webhookData?.instance?.instanceName || null;
  } catch (error) {
    logger.error('Error extracting instance name from payload:', error);
    return null;
  }
}

async function generateAIResponse(
  query: string,
  context: string,
  conversationId: string,
  systemPrompt: string | null = null,
  temperature: number = 0.7,
  userId: string | null = null  // Added userId parameter
): Promise<any> {
  try {
    logger.log(`Generating AI response for query: "${query.substring(0, 50)}..."`);
    if (userId) {
      logger.log(`Using user ID for AI response: ${userId}`);
    } else {
      logger.warn('No user ID provided for AI response generation');
    }
    
    const { data, error } = await supabaseAdmin.functions.invoke('generate-response', {
      body: {
        query,
        context,
        systemPrompt,
        includeConversationHistory: true,
        conversationId,
        temperature,
        userId  // Pass the user ID to generate-response
      },
    });

    if (error || !data.success) {
      throw new Error(error?.message || data?.error || 'Failed to generate AI response');
    }

    logger.log('AI response generated successfully');
    if (userId) {
      logger.log(`[AI_COUNTING] Response counted for user ${userId}`);
    }
    
    return data;
  } catch (error) {
    logger.error('Error generating AI response:', error);
    return { 
      success: false, 
      answer: "I'm sorry, I encountered an error processing your request. Please try again later.",
      error: error.message 
    };
  }
}

function extractUserMessage(data: any): string | null {
  try {
    if (data.message?.ephemeralMessage) {
      data.message = data.message.ephemeralMessage.message;
    }

    if (data.message?.viewOnceMessageV2) {
      data.message = data.message.viewOnceMessageV2.message;
    }

    if (data.message?.viewOnceMessage) {
      data.message = data.message.viewOnceMessage.message;
    }

    const messageTypes = ['conversation', 'imageMessage', 'videoMessage', 'extendedTextMessage', 'documentMessage', 'audioMessage'];
    for (const messageType of messageTypes) {
      if (data.message?.[messageType]) {
        if (messageType === 'conversation') {
          return data.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
          return data.message.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
          return data.message.imageMessage.caption || 'Image received';
        } else if (messageType === 'videoMessage') {
          return data.message.videoMessage.caption || 'Video received';
        } else if (messageType === 'documentMessage') {
          return data.message.documentMessage.caption || 'Document received';
        } else if (messageType === 'audioMessage') {
          return 'Audio message received';
        }
      }
    }
    return null;
  } catch (error) {
    logger.error('Error extracting user message:', error);
    return null;
  }
}

async function findOrCreateConversation(instanceId: string, userPhone: string): Promise<{ conversation: any, isNew: boolean }> {
  try {
    // Normalize phone number by removing non-digit characters
    const normalizedPhone = userPhone.replace(/\D/g, '');

    // Check if a conversation already exists
    let { data: conversations, error: conversationError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('user_phone', normalizedPhone);

    if (conversationError) {
      logger.error('Error fetching conversation:', conversationError);
      throw conversationError;
    }

    if (conversations && conversations.length > 0) {
      // Conversation exists, return it
      return { conversation: conversations[0], isNew: false };
    } else {
      // Conversation doesn't exist, create a new one
      const { data: newConversation, error: newConversationError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .insert([
          {
            instance_id: instanceId,
            user_phone: normalizedPhone,
            status: 'active',
            conversation_data: {}
          }
        ])
        .select('*');

      if (newConversationError) {
        logger.error('Error creating conversation:', newConversationError);
        throw newConversationError;
      }

      return { conversation: newConversation[0], isNew: true };
    }
  } catch (error) {
    logger.error('Error finding or creating conversation:', error);
    return { conversation: null, isNew: false };
  }
}

async function storeMessage(conversationId: string, role: string, content: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert([
        {
          conversation_id: conversationId,
          role: role,
          content: content,
          timestamp: new Date().toISOString()
        }
      ]);

    if (error) {
      logger.error('Error storing message:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Error storing message:', error);
  }
}

async function sendWhatsAppMessage(instanceName: string, phone: string, message: string): Promise<boolean> {
  try {
    const apiUrl = `${EVOLUTION_API_BASE_URL}/message/sendText/${instanceName}`;
    const requestBody = {
      phone: phone,
      message: message
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Error sending WhatsApp message:', errorData);
      throw new Error(`Failed to send message: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    logger.log('WhatsApp message sent successfully:', responseData);
    return true;
  } catch (error) {
    logger.error('Error sending WhatsApp message:', error);
    return false;
  }
}

async function fetchRelevantContexts(conversationId: string, userMessage: string): Promise<{ contexts: string[] }> {
  try {
    // Fetch the last 5 messages from the conversation
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('content')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(5);

    if (messagesError) {
      logger.error('Error fetching recent messages:', messagesError);
      return { contexts: [] };
    }

    // Extract message content and join into a single string
    const recentMessages = messages.map(msg => msg.content).join('\n');

    // Combine recent messages with the current user message for context
    const combinedContext = `${recentMessages}\n${userMessage}`;

    // Call the Supabase function to fetch relevant contexts
    const { data, error } = await supabaseAdmin.functions.invoke('fetch-relevant-contexts', {
      body: {
        query: userMessage,
        context: combinedContext
      }
    });

    if (error) {
      logger.error('Error fetching relevant contexts:', error);
      return { contexts: [] };
    }

    // Ensure the response data is an array of strings
    const contexts = Array.isArray(data) ? data : [];

    return { contexts: contexts };
  } catch (error) {
    logger.error('Error fetching relevant contexts:', error);
    return { contexts: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook
    const webhookSecret = req.headers.get('webhook-secret') || '';
    
    if (webhookSecret !== DB_WEBHOOK_SECRET) {
      logger.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid webhook secret' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }
    
    const webhookData = await req.json();
    const instanceName = extractInstanceNameFromPayload(webhookData);
    
    if (!instanceName) {
      throw new Error('Instance name not found in webhook payload');
    }
    
    logger.log(`Processing webhook for instance: ${instanceName}`);

    // Fetch instance details from database
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, user_id, ai_enabled, ai_config')
      .eq('instance_name', instanceName)
      .single();
    
    if (instanceError || !instanceData) {
      throw new Error(`Instance not found: ${instanceError?.message || 'No data'}`);
    }

    const { id: instanceId, ai_enabled, ai_config, user_id: instanceOwnerUserId } = instanceData;
    logger.log(`Instance found: ${instanceId}, AI enabled: ${ai_enabled}, User ID: ${instanceOwnerUserId}`);
    
    if (!webhookData.data) {
      return new Response(
        JSON.stringify({ success: true, message: 'No data to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Process webhook data
    const { data } = webhookData;
    
    if (!data.key || !data.key.remoteJid || data.key.fromMe) {
      return new Response(
        JSON.stringify({ success: true, message: 'Not a user message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract and normalize the phone number
    const remoteJidParts = data.key.remoteJid.split('@');
    const phone = remoteJidParts[0];
    
    // Check if this is a valid user message
    const userMessage = extractUserMessage(data);
    
    if (!userMessage) {
      logger.log('No user message content to process');
      return new Response(
        JSON.stringify({ success: true, message: 'No message content to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    logger.log(`Processing message from ${phone}: "${userMessage.substring(0, 50)}..."`);
    
    // Find or create a conversation
    const { conversation, isNew } = await findOrCreateConversation(instanceId, phone);
    
    if (!conversation) {
      throw new Error('Failed to find or create conversation');
    }
    
    const { id: conversationId } = conversation;
    logger.log(`Using conversation ID: ${conversationId} (new: ${isNew})`);
    
    // Store the incoming message
    await storeMessage(conversationId, 'user', userMessage);
    
    // If AI is enabled for this instance, process the message with AI
    if (ai_enabled && ai_config) {
      logger.log('AI is enabled, processing with AI...');
      
      const { contexts } = await fetchRelevantContexts(conversationId, userMessage);
      const context = contexts.join('\n\n---\n\n');
      
      // Generate AI response
      const aiResponse = await generateAIResponse(
        userMessage, 
        context, 
        conversationId,
        ai_config.system_prompt || null,
        ai_config.temperature || 0.7,
        instanceOwnerUserId  // Pass the user ID to count usage
      );
      
      if (aiResponse && aiResponse.success) {
        logger.log('AI response generated, sending to user...');
        
        // Store the AI response in the conversation
        await storeMessage(conversationId, 'assistant', aiResponse.answer);
        
        // Store AI interaction for analysis
        await supabaseAdmin
          .from('whatsapp_ai_interactions')
          .insert({
            conversation_id: conversationId,
            query: userMessage,
            response: aiResponse.answer,
            instance_id: instanceId,
            user_id: instanceOwnerUserId,  // Include user ID in the AI interaction record
            token_usage: aiResponse.tokenUsage
          });
        
        // Send the AI response to the user
        const sendResult = await sendWhatsAppMessage(instanceName, phone, aiResponse.answer);
        
        if (sendResult) {
          logger.log('AI response sent to user successfully');
          if (instanceOwnerUserId) {
            logger.log(`[AI_COUNTING] Successfully processed AI response for user ${instanceOwnerUserId}`);
          }
        } else {
          logger.error('Failed to send AI response to user');
        }
      } else {
        logger.error('Failed to generate AI response:', aiResponse?.error);
      }
    } else {
      logger.log('AI is not enabled for this instance, no AI processing needed');
    }
    
    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error processing webhook:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
