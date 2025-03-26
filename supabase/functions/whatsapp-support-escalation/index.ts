
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface MessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  pushName: string;
}

interface WebhookData {
  instance: string;
  event: string;
  data: MessageData;
}

// Simple fuzzy matching function
function fuzzyMatch(text: string, keyword: string): boolean {
  // Convert both to lowercase for case-insensitive matching
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();

  // Direct match
  if (textLower.includes(keywordLower)) {
    return true;
  }

  // Allow one character difference (very simple fuzzy)
  // This is a basic implementation - you might want to use a proper fuzzy matching library
  if (keywordLower.length > 3) {
    for (let i = 0; i < keywordLower.length; i++) {
      const fuzzyKeyword = keywordLower.substring(0, i) + keywordLower.substring(i + 1);
      if (textLower.includes(fuzzyKeyword)) {
        return true;
      }
    }
  }

  return false;
}

async function handleIncomingMessage(webhookData: WebhookData) {
  try {
    const { instance, data } = webhookData;
    
    // Extract the message content and phone number
    const messageContent = data.message.conversation || 
                         data.message.extendedTextMessage?.text || 
                         '';
    const phoneNumber = data.key.remoteJid.split('@')[0];
    
    // Skip messages sent by the bot itself
    if (data.key.fromMe) {
      return { success: true, action: 'skipped_bot_message' };
    }

    // Skip empty messages
    if (!messageContent.trim()) {
      return { success: true, action: 'skipped_empty_message' };
    }

    console.log(`Processing message from ${phoneNumber} in instance ${instance}: "${messageContent.substring(0, 50)}..."`);

    // Step 1: Get instance ID from the instance name
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instance)
      .single();
    
    if (instanceError || !instanceData) {
      console.error(`Instance not found: ${instance}`, instanceError);
      return { success: false, error: 'Instance not found', details: instanceError };
    }
    
    const instanceId = instanceData.id;

    // Step 2: Check if conversation is already escalated
    const { data: existingEscalation } = await supabase
      .from('whatsapp_escalated_conversations')
      .select('id')
      .eq('whatsapp_instance_id', instanceId)
      .eq('user_phone', phoneNumber)
      .eq('is_resolved', false)
      .single();
    
    if (existingEscalation) {
      console.log(`Conversation with ${phoneNumber} is already escalated, skipping keyword check`);
      return { success: true, action: 'already_escalated' };
    }

    // Step 3: Get support keywords for this instance
    const { data: keywords, error: keywordsError } = await supabase
      .from('whatsapp_support_keywords')
      .select('keyword, category')
      .eq('is_active', true);
    
    if (keywordsError) {
      console.error('Error fetching keywords:', keywordsError);
      return { success: false, error: 'Failed to fetch keywords', details: keywordsError };
    }
    
    if (!keywords || keywords.length === 0) {
      console.log('No keywords configured, skipping escalation check');
      return { success: true, action: 'no_keywords_configured' };
    }

    // Step 4: Check if message contains any of the keywords
    let matchedKeyword = null;
    let keywordCategory = null;
    
    for (const kw of keywords) {
      if (fuzzyMatch(messageContent, kw.keyword)) {
        matchedKeyword = kw.keyword;
        keywordCategory = kw.category;
        break;
      }
    }
    
    if (!matchedKeyword) {
      console.log('No keywords matched, no escalation needed');
      return { success: true, action: 'no_keywords_matched' };
    }
    
    console.log(`Matched keyword "${matchedKeyword}" in category "${keywordCategory || 'uncategorized'}"`);

    // Step 5: Get support configuration
    const { data: supportConfig, error: configError } = await supabase
      .from('whatsapp_support_config')
      .select('support_phone_number, escalation_message, notification_message')
      .eq('whatsapp_instance_id', instanceId)
      .single();
    
    if (configError || !supportConfig) {
      console.error('Support config not found for instance:', instanceId, configError);
      return { success: false, error: 'Support config not found', details: configError };
    }
    
    const { support_phone_number, escalation_message, notification_message } = supportConfig;
    
    if (!support_phone_number) {
      console.error('Support phone number not configured for instance:', instanceId);
      return { success: false, error: 'Support phone number not configured' };
    }

    // Step 6: Create escalation record
    const { data: escalation, error: escalationError } = await supabase
      .from('whatsapp_escalated_conversations')
      .insert({
        whatsapp_instance_id: instanceId,
        user_phone: phoneNumber,
        is_resolved: false
      })
      .select()
      .single();
    
    if (escalationError) {
      console.error('Failed to create escalation record:', escalationError);
      return { success: false, error: 'Failed to create escalation record', details: escalationError };
    }

    // Step 7: Send message to customer
    if (escalation_message) {
      try {
        const customerResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            number: phoneNumber,
            options: {
              delay: 1000
            },
            textMessage: {
              text: escalation_message
            }
          })
        });
        
        if (!customerResponse.ok) {
          console.error('Failed to send escalation message to customer:', await customerResponse.text());
        } else {
          console.log('Sent escalation message to customer');
        }
      } catch (err) {
        console.error('Error sending message to customer:', err);
      }
    }

    // Step 8: Notify support agent
    if (notification_message) {
      try {
        // Create a customized notification message with the customer message and other details
        const customNotification = `${notification_message}\n\nFrom: +${phoneNumber}\nKeyword: ${matchedKeyword}${keywordCategory ? `\nCategory: ${keywordCategory}` : ''}\nMessage: "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`;
        
        const supportResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            number: support_phone_number,
            options: {
              delay: 1000
            },
            textMessage: {
              text: customNotification
            }
          })
        });
        
        if (!supportResponse.ok) {
          console.error('Failed to send notification to support agent:', await supportResponse.text());
        } else {
          console.log('Sent notification to support agent');
        }
      } catch (err) {
        console.error('Error sending message to support agent:', err);
      }
    }

    // Log the escalation action for debug purposes
    await supabase.from('webhook_debug_logs').insert({
      category: 'escalation',
      message: `Escalated conversation with ${phoneNumber} due to keyword "${matchedKeyword}"`,
      data: {
        instance,
        phone: phoneNumber,
        keyword: matchedKeyword,
        category: keywordCategory,
        escalation_id: escalation.id,
        message_preview: messageContent.substring(0, 100)
      }
    });

    return { 
      success: true, 
      action: 'escalated',
      matched_keyword: matchedKeyword,
      category: keywordCategory,
      escalation_id: escalation.id
    };
  } catch (error) {
    console.error('Error processing message for escalation:', error);
    return { success: false, error: 'Internal error processing message', details: error };
  }
}

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

    // Parse the webhook data
    const webhookData = await req.json() as WebhookData;

    // Only process messages.upsert events (incoming messages)
    if (webhookData.event !== 'messages.upsert') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Event ignored, only processing messages.upsert events' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Process the message
    const result = await handleIncomingMessage(webhookData);

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error('Error in support escalation function:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
