
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface WebhookData {
  instance: string;
  event: string;
  data: any;
}

export interface EscalationResult {
  success: boolean;
  action: 'ignored' | 'escalated' | 'already_escalated' | 'no_match';
  message?: string;
  matched_keyword?: string;
  category?: string;
  skip_ai_processing?: boolean;
}

export async function handleSupportEscalation(
  webhookData: WebhookData,
  supabaseUrl: string,
  supabaseAnonKey: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  supabaseServiceRoleKey?: string,
  foundInstanceId?: string,
): Promise<EscalationResult> {
  // Use service role key if provided (more permissions), otherwise use anon key
  const supabase = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey
  );

  try {
    // If this is not a messages.upsert event, ignore it
    if (webhookData.event !== 'messages.upsert') {
      return {
        success: true,
        action: 'ignored',
        message: 'Not a message event',
      };
    }

    // Extract the relevant data from the webhook payload
    const { data: messageData = {} } = webhookData;
    
    // Skip if the message doesn't have a key (required to identify the message)
    if (!messageData.key) {
      return {
        success: true,
        action: 'ignored',
        message: 'No message key found',
      };
    }

    // Skip if the message is from a group chat or from the bot itself
    const remoteJid = messageData.key.remoteJid || '';
    const isFromMe = messageData.key.fromMe || false;
    
    if (remoteJid.includes('@g.us') || isFromMe) {
      return {
        success: true,
        action: 'ignored',
        message: 'Group message or sent by bot',
      };
    }

    // Extract the phone number from the remote JID
    const userPhone = remoteJid.replace('@s.whatsapp.net', '');
    
    // Skip if no phone number could be extracted
    if (!userPhone) {
      return {
        success: true,
        action: 'ignored',
        message: 'Could not extract user phone',
      };
    }

    // Extract the message text
    const messageText = 
      messageData.message?.conversation || 
      messageData.message?.extendedTextMessage?.text || 
      messageData.message?.imageMessage?.caption || 
      '';

    // Skip if no message text
    if (!messageText) {
      return {
        success: true,
        action: 'ignored',
        message: 'No message text found',
      };
    }

    // Get the instance ID based on instance name (if not already provided)
    let instanceId = foundInstanceId;
    if (!instanceId) {
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('instance_name', webhookData.instance)
        .single();

      if (instanceError) {
        console.error('Error finding instance:', instanceError);
        return {
          success: false,
          action: 'ignored',
          message: 'Instance not found',
        };
      }
      
      instanceId = instanceData.id;
    }

    // Check if this conversation is already escalated to human support
    const { data: existingEscalation, error: escalationError } = await supabase
      .from('whatsapp_escalated_conversations')
      .select('id')
      .eq('whatsapp_instance_id', instanceId)
      .eq('user_phone', userPhone)
      .eq('is_resolved', false)
      .maybeSingle();

    if (escalationError && escalationError.code !== 'PGRST116') {
      console.error('Error checking escalation:', escalationError);
      return {
        success: false,
        action: 'ignored',
        message: 'Error checking escalation status',
      };
    }

    if (existingEscalation) {
      return {
        success: true,
        action: 'already_escalated',
        message: 'Conversation already escalated to human support',
        skip_ai_processing: true,
      };
    }

    // Get support keywords for this specific instance
    const { data: keywords, error: keywordsError } = await supabase
      .from('whatsapp_support_keywords')
      .select('keyword, category')
      .eq('whatsapp_instance_id', instanceId);

    if (keywordsError) {
      console.error('Error fetching keywords:', keywordsError);
      return {
        success: false,
        action: 'ignored',
        message: 'Failed to fetch keywords',
      };
    }

    // Check if the message contains any support keywords
    const normalizedMessage = messageText.toLowerCase();
    const matchedKeyword = keywords.find(k => 
      normalizedMessage.includes(k.keyword.toLowerCase())
    );
    
    if (!matchedKeyword) {
      return {
        success: true,
        action: 'no_match',
        message: 'No matching keywords found',
      };
    }

    // Get support config for this instance
    const { data: supportConfig, error: supportConfigError } = await supabase
      .from('whatsapp_support_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .maybeSingle();

    if (supportConfigError && supportConfigError.code !== 'PGRST116') {
      console.error('Error fetching support config:', supportConfigError);
      return {
        success: false,
        action: 'ignored',
        message: 'Failed to fetch support config',
      };
    }

    // If no support config or no support phone, we can't escalate
    if (!supportConfig || !supportConfig.support_phone_number) {
      console.log('No support configuration found for escalation');
      return {
        success: true,
        action: 'no_match',
        message: 'No support configuration found',
      };
    }

    // Create a record of the escalation
    const { error: createEscalationError } = await supabase
      .from('whatsapp_escalated_conversations')
      .insert({
        whatsapp_instance_id: instanceId,
        user_phone: userPhone,
      });

    if (createEscalationError) {
      console.error('Error creating escalation record:', createEscalationError);
      return {
        success: false,
        action: 'ignored',
        message: 'Failed to create escalation record',
      };
    }

    // Send a message to the user
    if (supportConfig.escalation_message) {
      try {
        // Determine the Evolution API URL
        const sendUrl = `${evolutionApiUrl}/message/sendText/${webhookData.instance}`;
        
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: userPhone,
            text: supportConfig.escalation_message
          })
        });

        if (!sendResponse.ok) {
          console.error('Failed to send escalation message to user');
        }
      } catch (error) {
        console.error('Error sending escalation message to user:', error);
      }
    }

    // Notify the support team
    if (supportConfig.support_phone_number && supportConfig.notification_message) {
      try {
        // Determine the Evolution API URL
        const sendUrl = `${evolutionApiUrl}/message/sendText/${webhookData.instance}`;
        
        // Construct a support notification with customer info and message
        const notificationText = `${supportConfig.notification_message}\n\nCustomer: ${userPhone}\nMessage: ${messageText}\nCategory: ${matchedKeyword.category || 'Uncategorized'}`;
        
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: supportConfig.support_phone_number.replace(/\+/g, ''),
            text: notificationText
          })
        });

        if (!sendResponse.ok) {
          console.error('Failed to send notification to support');
        }
      } catch (error) {
        console.error('Error sending notification to support:', error);
      }
    }

    return {
      success: true,
      action: 'escalated',
      message: 'Escalated to human support',
      matched_keyword: matchedKeyword.keyword,
      category: matchedKeyword.category || undefined,
      skip_ai_processing: true,
    };
  } catch (error) {
    console.error('Unhandled error in support escalation:', error);
    return {
      success: false,
      action: 'ignored',
      message: `Error: ${error.message || 'Unknown error'}`,
    };
  }
}
