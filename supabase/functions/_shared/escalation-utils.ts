
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Simple fuzzy matching function
export function fuzzyMatch(text: string, keyword: string): boolean {
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

export interface MessageData {
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

export interface WebhookData {
  instance: string;
  event: string;
  data: MessageData;
}

// Default API URL - Set to the correct Evolution API URL
const DEFAULT_EVOLUTION_API_URL = 'https://api.convgo.com';

/**
 * Core logic for checking if a message should be escalated to human support
 */
export async function handleSupportEscalation(
  webhookData: WebhookData,
  supabaseUrl: string,
  supabaseAnonKey: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  supabaseServiceRoleKey?: string, // Added parameter for service role key
  foundInstanceId?: string // Parameter to accept an already-found instance ID
): Promise<{
  success: boolean;
  action?: string;
  matched_keyword?: string;
  category?: string;
  escalation_id?: string;
  error?: string;
  details?: any;
  skip_ai_processing?: boolean;
}> {
  // Initialize Supabase client with service role key (renamed to supabaseAdmin for consistency)
  // This matches the approach used in the webhook function
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);
  
  try {
    // Ensure we're using the correct instance name from the webhook data
    // This helps prevent mixing up instances in the webhook flow
    const { instance, data } = webhookData;
    
    // Extract the message content and phone number
    const messageContent = data.message.conversation || 
                         data.message.extendedTextMessage?.text || 
                         '';
    const phoneNumber = data.key.remoteJid.split('@')[0];
    
    // Skip messages sent by the bot itself
    if (data.key.fromMe) {
      return { success: true, action: 'skipped_bot_message', skip_ai_processing: false };
    }

    // Skip empty messages
    if (!messageContent.trim()) {
      return { success: true, action: 'skipped_empty_message', skip_ai_processing: false };
    }

    console.log(`Processing message from ${phoneNumber} in instance ${instance}: "${messageContent.substring(0, 50)}..."`);

    // Use the found instance ID if provided (coming from webhook)
    let instanceId = foundInstanceId;
    
    // Only look up the instance if we don't already have the ID
    if (!instanceId) {
      // Use the instance name directly from the webhook data
      const instanceName = instance;

      // Try to get the instance by name
      const { data: instanceData, error: instanceError } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id')
        .eq('instance_name', instanceName)
        .single();
      
      if (instanceError || !instanceData) {
        console.error(`Instance not found: ${instanceName}`, instanceError);
        // Log details for troubleshooting
        await supabaseAdmin.from('webhook_debug_logs').insert({
          category: 'escalation_error',
          message: `Failed to find instance: ${instanceName}`,
          data: { error: instanceError, webhook_data: webhookData }
        });
        return { success: false, error: 'Instance not found', details: instanceError, skip_ai_processing: false };
      }
      
      instanceId = instanceData.id;
    }

    // Step 2: Check if conversation is already escalated (ONLY currently active escalations)
    const { data: existingEscalation } = await supabaseAdmin
      .from('whatsapp_escalated_conversations')
      .select('id')
      .eq('whatsapp_instance_id', instanceId)
      .eq('user_phone', phoneNumber)
      .eq('is_resolved', false)
      .single();
    
    if (existingEscalation) {
      console.log(`Conversation with ${phoneNumber} is already escalated, skipping keyword check`);
      return { 
        success: true, 
        action: 'already_escalated', 
        escalation_id: existingEscalation.id,
        // When already escalated, we usually want to skip AI processing
        // You may want to make this configurable via a support settings
        skip_ai_processing: true 
      };
    }

    // Step 3: Get support keywords for this instance
    const { data: keywords, error: keywordsError } = await supabaseAdmin
      .from('whatsapp_support_keywords')
      .select('keyword, category')
      .eq('is_active', true);
    
    if (keywordsError) {
      console.error('Error fetching keywords:', keywordsError);
      return { success: false, error: 'Failed to fetch keywords', details: keywordsError, skip_ai_processing: false };
    }
    
    if (!keywords || keywords.length === 0) {
      console.log('No keywords configured, skipping escalation check');
      return { success: true, action: 'no_keywords_configured', skip_ai_processing: false };
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
      return { success: true, action: 'no_keywords_matched', skip_ai_processing: false };
    }
    
    console.log(`Matched keyword "${matchedKeyword}" in category "${keywordCategory || 'uncategorized'}"`);

    // Step 5: Get support configuration
    const { data: supportConfig, error: configError } = await supabaseAdmin
      .from('whatsapp_support_config')
      .select('support_phone_number, escalation_message, notification_message')
      .eq('whatsapp_instance_id', instanceId)
      .single();
    
    if (configError || !supportConfig) {
      console.error('Support config not found for instance:', instanceId, configError);
      return { success: false, error: 'Support config not found', details: configError, skip_ai_processing: false };
    }
    
    const { support_phone_number, escalation_message, notification_message } = supportConfig;
    
    if (!support_phone_number) {
      console.error('Support phone number not configured for instance:', instanceId);
      return { success: false, error: 'Support phone number not configured', skip_ai_processing: false };
    }

    // Step 6: Create escalation record
    const { data: escalation, error: escalationError } = await supabaseAdmin
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
      return { success: false, error: 'Failed to create escalation record', details: escalationError, skip_ai_processing: false };
    }

    // Ensure evolutionApiUrl has a valid value, using the default if necessary
    const apiBaseUrl = evolutionApiUrl || DEFAULT_EVOLUTION_API_URL;

    // Step 7: Send message to customer
    if (escalation_message) {
      try {
        // Use customer's phone number (phoneNumber) and ensure full URL with protocol
        const apiUrl = `${apiBaseUrl}/message/sendText/${instance}`;
        console.log(`Sending escalation message to customer via: ${apiUrl}`);
        
        const customerResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: phoneNumber, // Send TO the customer phone number
            text: escalation_message // Use the simple text format
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
        
        // Use support agent's phone number and ensure full URL with protocol
        const apiUrl = `${apiBaseUrl}/message/sendText/${instance}`;
        console.log(`Sending notification to support agent via: ${apiUrl}`);
        
        const supportResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: support_phone_number, // Send TO the support phone number
            text: customNotification // Use the simple text format
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
    await supabaseAdmin.from('webhook_debug_logs').insert({
      category: 'escalation',
      message: `Escalated conversation with ${phoneNumber} due to keyword "${matchedKeyword}"`,
      data: {
        instance: instance,
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
      escalation_id: escalation.id,
      // When escalated, typically we want to skip AI processing
      // This could be made configurable via a database setting
      skip_ai_processing: true
    };
  } catch (error) {
    console.error('Error processing message for escalation:', error);
    return { success: false, error: 'Internal error processing message', details: error, skip_ai_processing: false };
  }
}
