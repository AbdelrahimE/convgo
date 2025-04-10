import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleSupportEscalation } from "../_shared/escalation-utils.ts";
import { logDebug } from "../_shared/webhook-logger.ts";
import { calculateSimilarity } from "../_shared/text-similarity.ts";
import { extractAudioDetails } from "../_shared/audio-processing.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const AI_API_URL = Deno.env.get('AI_API_URL') || '';
const AI_API_KEY = Deno.env.get('AI_API_KEY') || '';
const ENABLE_AI_PROCESSING = Deno.env.get('ENABLE_AI_PROCESSING') === 'true';
const SUPPORT_ESCALATION_ENABLED = Deno.env.get('SUPPORT_ESCALATION_ENABLED') === 'true';
const IGNORE_DUPLICATE_MESSAGES = Deno.env.get('IGNORE_DUPLICATE_MESSAGES') === 'true';
const DUPLICATE_CHECK_THRESHOLD_SECONDS = parseInt(Deno.env.get('DUPLICATE_CHECK_THRESHOLD_SECONDS') || '60');
const DUPLICATE_SIMILARITY_THRESHOLD = parseFloat(Deno.env.get('DUPLICATE_SIMILARITY_THRESHOLD') || '0.8');

// Initialize Supabase client
function initializeSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });
}

// Helper function to fetch recent messages from the database
async function getRecentMessages(supabaseClient: any, instanceName: string, phone: string, limit: number = 5) {
  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('instance_name', instanceName)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent messages:', error);
    return [];
  }

  return data || [];
}

// Helper function to get the most recent message for a phone number
async function getMostRecentMessage(supabaseClient: any, instanceName: string, phone: string) {
  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('instance_name', instanceName)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching most recent message:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

// Helper function to check if a message is a duplicate based on content similarity
function isMessageDuplicate(newMessage: string, recentMessages: any[], similarityThreshold: number): boolean {
  if (!newMessage || recentMessages.length === 0) {
    return false;
  }

  for (const recentMessage of recentMessages) {
    if (!recentMessage.content) continue; // Skip if recent message has no content

    const similarity = calculateSimilarity(newMessage, recentMessage.content);
    if (similarity >= similarityThreshold) {
      console.log(`Message deemed as duplicate with similarity score: ${similarity}`);
      return true;
    }
  }

  return false;
}

// Helper function to check if the timestamp difference is close enough to consider a duplicate
function isCloseEnoughTimestamp(newTimestamp: string, recentMessageTimestamp: string, thresholdSeconds: number): boolean {
  const newDate = new Date(newTimestamp);
  const recentDate = new Date(recentMessageTimestamp);
  const differenceInSeconds = Math.abs((newDate.getTime() - recentDate.getTime()) / 1000);
  return differenceInSeconds <= thresholdSeconds;
}

// Helper function to determine the duplicate check threshold
function getDuplicateThreshold(): number {
  const threshold = parseInt(Deno.env.get('DUPLICATE_CHECK_THRESHOLD_SECONDS') || '60');
  return isNaN(threshold) ? 60 : threshold;
}

// Helper function to process message for AI
async function processMessageForAI(webhookData: any, instanceName: string, messageId: string, message: any) {
  const supabaseClient = initializeSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const phone = message?.key?.remoteJid?.split('@')[0];
  const messageTimestamp = new Date(message.messageTimestamp * 1000).toISOString();

  // Check for duplicate messages
  if (IGNORE_DUPLICATE_MESSAGES) {
    const mostRecentMessage = await getMostRecentMessage(supabaseClient, instanceName, phone);

    if (mostRecentMessage) {
      // If the new message timestamp is not too far off from the most recent message, check for content similarity
      if (isCloseEnoughTimestamp(messageTimestamp, mostRecentMessage.created_at, DUPLICATE_CHECK_THRESHOLD_SECONDS)) {
        const recentMessages = await getRecentMessages(supabaseClient, instanceName, phone, 5);
        const newMessageContent = message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          message.message?.imageMessage?.caption;

        if (isMessageDuplicate(newMessageContent, recentMessages, DUPLICATE_SIMILARITY_THRESHOLD)) {
          await logDebug('DUPLICATE_MESSAGE', `Duplicate message found, ignoring AI processing`, { messageId, instanceName, phone });
          return false;
        }
      }
    }
  }
  
  // Process voice messages - uses the extracted extractAudioDetails function
  if (message.message?.audioMessage) {
    try {
      const audioDetails = extractAudioDetails(message);
      if (!audioDetails || !audioDetails.audioUrl) {
        await logDebug('AUDIO_PROCESS_ERROR', `No valid audio URL found in message`, { messageId, instanceName });
        return false;
      }
      
      const aiResponse = await processAttachment({
        attachmentUrl: audioDetails.audioUrl,
        mimeType: audioDetails.mimeType,
        instanceName,
        messageId,
        phone,
        messageTimestamp,
        type: 'audio',
        pttFlag: audioDetails.pttFlag
      });

      return aiResponse;
    } catch (error) {
      console.error('Error processing audio message:', error);
      await logDebug('AUDIO_PROCESS_ERROR', `Error processing audio message: ${error}`, { messageId, instanceName });
      return false;
    }
  }
  
  // Process text messages
  if (message.message?.conversation || message.message?.extendedTextMessage?.text) {
    const text = message.message.conversation || message.message.extendedTextMessage.text;
    try {
      const aiResponse = await fetch(`${AI_API_URL}/process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          message: text,
          instance_name: instanceName,
          phone: phone,
          message_id: messageId,
          message_timestamp: messageTimestamp
        }),
      });

      if (!aiResponse.ok) {
        console.error('AI API Error:', aiResponse.status, await aiResponse.text());
        await logDebug('AI_API_ERROR', `AI API responded with ${aiResponse.status}`, { messageId, instanceName });
        return false;
      }

      const aiData = await aiResponse.json();

      if (aiData.success) {
        await logDebug('AI_RESPONSE', `Successfully processed message with AI`, { messageId, instanceName, aiData });
        return aiData;
      } else {
        console.error('AI Processing Failed:', aiData.error);
        await logDebug('AI_PROCESSING_FAILED', `AI processing failed: ${aiData.error}`, { messageId, instanceName });
        return false;
      }
    } catch (error) {
      console.error('Error calling AI API:', error);
      await logDebug('AI_API_ERROR', `Error calling AI API: ${error}`, { messageId, instanceName });
      return false;
    }
  }

  return false;
}

// Helper function to process attachments
async function processAttachment({ attachmentUrl, mimeType, instanceName, messageId, phone, messageTimestamp, type, pttFlag }: {
  attachmentUrl: string;
  mimeType: string;
  instanceName: string;
  messageId: string;
  phone: string;
  messageTimestamp: string;
  type: 'image' | 'audio';
  pttFlag?: boolean;
}) {
  try {
    const aiResponse = await fetch(`${AI_API_URL}/process-attachment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        attachment_url: attachmentUrl,
        mime_type: mimeType,
        instance_name: instanceName,
        phone: phone,
        message_id: messageId,
        message_timestamp: messageTimestamp,
        type: type,
        ptt_flag: pttFlag
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API Error:', aiResponse.status, await aiResponse.text());
      await logDebug('AI_API_ERROR', `AI API responded with ${aiResponse.status}`, { messageId, instanceName });
      return false;
    }

    const aiData = await aiResponse.json();

    if (aiData.success) {
      await logDebug('AI_RESPONSE', `Successfully processed attachment with AI`, { messageId, instanceName, aiData });
      return aiData;
    } else {
      console.error('AI Processing Failed:', aiData.error);
      await logDebug('AI_PROCESSING_FAILED', `AI processing failed: ${aiData.error}`, { messageId, instanceName });
      return false;
    }
  } catch (error) {
    console.error('Error calling AI API:', error);
    await logDebug('AI_API_ERROR', `Error calling AI API: ${error}`, { messageId, instanceName });
    return false;
  }
}

// Helper function to process image messages for AI
async function processImageForAI(webhookData: any, instanceName: string, messageId: string, message: any) {
  if (message.message?.imageMessage) {
    try {
      const aiResponse = await processAttachment({
        attachmentUrl: message.message.imageMessage.url,
        mimeType: message.message.imageMessage.mimetype,
        instanceName,
        messageId,
        phone: message?.key?.remoteJid?.split('@')[0],
        messageTimestamp: new Date(message.messageTimestamp * 1000).toISOString(),
        type: 'image'
      });
      return aiResponse;
    } catch (error) {
      console.error('Error processing image message:', error);
      await logDebug('IMAGE_PROCESS_ERROR', `Error processing image message: ${error}`, { messageId, instanceName });
      return false;
    }
  }
  return false;
}

// Determine whether we should process this message with AI
function shouldProcessAI(webhookData: any): boolean {
  if (!ENABLE_AI_PROCESSING) {
    console.log('AI processing is disabled.');
    return false;
  }

  const message = webhookData?.data[0];

  if (!message) {
    console.warn('No message data found in webhook.');
    return false;
  }

   // Ignore status messages and calls
   if (message.message?.protocolMessage || message.message?.call) {
    console.log('Ignoring protocol message or call.');
    return false;
  }

  // Check if the message is from a group
  if (message?.key?.remoteJid?.includes('@g.us')) {
    console.log('Ignoring group message.');
    return false;
  }

  return true;
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const webhookData = await req.json();
    console.log('Received webhook:', webhookData);

    // Log the entire webhook data for debugging
    await logDebug('WEBHOOK_RECEIVED', 'Full Webhook Data', webhookData);

    if (!shouldProcessAI(webhookData)) {
      return new Response(
        JSON.stringify({
          message: 'AI processing is disabled or message should be ignored.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const message = webhookData?.data[0];
    const instanceName = message?.key?.remoteJid?.split('@')[0];
    const messageId = message?.key?.id;

    if (!instanceName) {
      console.error('Instance name is missing in webhook data.');
      return new Response(
        JSON.stringify({ error: 'Instance name is missing in webhook data.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Start processing the message with AI
    await logDebug('AI_PROCESS_START', 'Start processing message with AI', { messageId, instanceName });
    const aiProcessingResult = await processMessageForAI(webhookData, instanceName, messageId, message);

    if (aiProcessingResult) {
      await logDebug('AI_PROCESS_COMPLETE', 'AI processing completed successfully', { messageId, instanceName });

      // If support escalation is enabled and AI processing was successful, trigger support escalation
      if (SUPPORT_ESCALATION_ENABLED && aiProcessingResult.escalate_support) {
        try {
          // Encode the transcribed text to ensure it's properly passed as a URL parameter
          const transcribedText = aiProcessingResult.transcription ? encodeURIComponent(aiProcessingResult.transcription) : '';

          const supportEscalationUrl = `${EVOLUTION_API_URL}/functions/v1/whatsapp-support-escalation?foundInstanceId=${instanceName}&transcribedText=${transcribedText}`;
          const supportEscalationResponse = await fetch(supportEscalationUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify(webhookData),
          });

          if (!supportEscalationResponse.ok) {
            console.error('Support Escalation Failed:', supportEscalationResponse.status, await supportEscalationResponse.text());
            await logDebug('SUPPORT_ESCALATION_FAILED', `Support escalation failed: ${supportEscalationResponse.status}`, { messageId, instanceName });
          } else {
            const escalationResult = await supportEscalationResponse.json();
            await logDebug('SUPPORT_ESCALATION_SUCCESS', 'Support escalation triggered successfully', { messageId, instanceName, escalationResult });
          }
        } catch (escalationError) {
          console.error('Error triggering support escalation:', escalationError);
          await logDebug('SUPPORT_ESCALATION_ERROR', `Error triggering support escalation: ${escalationError}`, { messageId, instanceName });
        }
      }
    } else {
      await logDebug('AI_PROCESS_SKIPPED', 'AI processing skipped or failed', { messageId, instanceName });
    }

    return new Response(
      JSON.stringify({
        data: aiProcessingResult,
        message: 'Webhook processed successfully.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
