
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Enhanced fuzzy matching function with balanced cross-language support
export function fuzzyMatch(text: string, keyword: string): boolean {
  // Detect language context
  const isArabic = /[\u0600-\u06FF]/.test(keyword);
  
  // Apply appropriate normalization
  const normalizedText = normalizeText(text, isArabic);
  const normalizedKeyword = normalizeText(keyword, isArabic);
  
  // Exact match after normalization
  if (normalizedText.includes(normalizedKeyword)) {
    return true;
  }
  
  // Character omission test (works for both languages)
  if (normalizedKeyword.length > 3) {
    for (let i = 0; i < normalizedKeyword.length; i++) {
      const fuzzyKeyword = normalizedKeyword.slice(0, i) + normalizedKeyword.slice(i + 1);
      if (normalizedText.includes(fuzzyKeyword)) {
        return true;
      }
    }
  }
  
  // Character transposition test (for both languages)
  if (normalizedKeyword.length > 3) {
    for (let i = 0; i < normalizedKeyword.length - 1; i++) {
      const transposedKeyword = 
        normalizedKeyword.slice(0, i) + 
        normalizedKeyword[i+1] + 
        normalizedKeyword[i] + 
        normalizedKeyword.slice(i+2);
      
      if (normalizedText.includes(transposedKeyword)) {
        return true;
      }
    }
  }
  
  // For Arabic, try common prefix/suffix variations
  if (isArabic && normalizedKeyword.length > 3) {
    // Common prefixes: ال، و، ب، ل، ف
    const withoutPrefix = normalizedKeyword.replace(/^(ال|و|ب|ل|ف)/, '');
    if (normalizedText.includes(withoutPrefix) && withoutPrefix.length > 2) {
      return true;
    }
    
    // Common suffixes: ة، ه، ها، ات، ون، ين
    const withoutSuffix = normalizedKeyword.replace(/(ة|ه|ها|ات|ون|ين)$/, '');
    if (normalizedText.includes(withoutSuffix) && withoutSuffix.length > 2) {
      return true;
    }
  }
  
  // For English, handle common plurals and word forms
  if (!isArabic && normalizedKeyword.length > 3) {
    // Simple plurals
    if (normalizedKeyword.endsWith('s')) {
      const singular = normalizedKeyword.slice(0, -1);
      if (normalizedText.includes(singular) && singular.length > 2) {
        return true;
      }
    } else {
      const plural = normalizedKeyword + 's';
      if (normalizedText.includes(plural)) {
        return true;
      }
    }
    
    // Simple suffixes: ing, ed, er
    for (const suffix of ['ing', 'ed', 'er']) {
      if (normalizedKeyword.endsWith(suffix)) {
        const base = normalizedKeyword.slice(0, -suffix.length);
        if (normalizedText.includes(base) && base.length > 2) {
          return true;
        }
      }
    }
  }
  
  // For both languages: limited edit distance for short keywords
  if (normalizedKeyword.length <= 5) {
    const words = normalizedText.split(/\s+/);
    for (const word of words) {
      if (simpleEditDistance(word, normalizedKeyword) <= 1) {
        return true;
      }
    }
  }
  
  return false;
}

// Helper function for text normalization
function normalizeText(text: string, isArabic: boolean): string {
  // Basic normalization for all languages
  let normalized = text.toLowerCase().trim();
  
  // Arabic-specific normalization
  if (isArabic || /[\u0600-\u06FF]/.test(normalized)) {
    normalized = normalized
      // Remove diacritics
      .replace(/[\u064B-\u065F]/g, '')
      // Normalize alef forms
      .replace(/[أإآ]/g, 'ا')
      // Normalize ya/alef maksura
      .replace(/[ى]/g, 'ي')
      // Normalize taa marbutah and haa (treating ة and ه as equivalent)
      .replace(/[ة]/g, 'ه');
  }
  
  return normalized;
}

// Simple edit distance calculation (efficient for short strings)
function simpleEditDistance(s1: string, s2: string): number {
  if (Math.abs(s1.length - s2.length) > 1) return 2; // Early exit for efficiency
  
  let distance = 0;
  const len = Math.min(s1.length, s2.length);
  
  for (let i = 0; i < len; i++) {
    if (s1[i] !== s2[i]) distance++;
    if (distance > 1) return distance; // Early exit if distance exceeds 1
  }
  
  distance += Math.abs(s1.length - s2.length);
  return distance;
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
    // Extract and validate the primary business instance name from the webhook data
    // This is critical for ensuring we're always using the correct instance for escalation logic
    const { instance, data } = webhookData;
    const businessInstanceName = instance; // Store the original business instance name
    
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

    console.log(`Processing message from ${phoneNumber} in business instance ${businessInstanceName}: "${messageContent.substring(0, 50)}..."`);

    // Use the found instance ID if provided (coming from webhook)
    let businessInstanceId = foundInstanceId;
    
    // Only look up the instance if we don't already have the ID
    if (!businessInstanceId) {
      // Always use the original business instance name, not any support instance
      const { data: instanceData, error: instanceError } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id')
        .eq('instance_name', businessInstanceName)
        .single();
      
      if (instanceError || !instanceData) {
        console.error(`Business instance not found: ${businessInstanceName}`, instanceError);
        // Log details for troubleshooting
        await supabaseAdmin.from('webhook_debug_logs').insert({
          category: 'escalation_error',
          message: `Failed to find business instance: ${businessInstanceName}`,
          data: { error: instanceError, webhook_data: webhookData }
        });
        return { success: false, error: 'Business instance not found', details: instanceError, skip_ai_processing: false };
      }
      
      businessInstanceId = instanceData.id;
    }

    // Step 2: Check if conversation is already escalated (ONLY currently active escalations)
    // We use the correct business instance ID here, not a support agent instance
    const { data: existingEscalation } = await supabaseAdmin
      .from('whatsapp_escalated_conversations')
      .select('id')
      .eq('whatsapp_instance_id', businessInstanceId)
      .eq('user_phone', phoneNumber)
      .eq('is_resolved', false)
      .single();
    
    if (existingEscalation) {
      console.log(`Conversation with ${phoneNumber} is already escalated, skipping keyword check`);
      return { 
        success: true, 
        action: 'already_escalated', 
        escalation_id: existingEscalation.id,
        skip_ai_processing: true 
      };
    }

    // Step 3: Get support keywords for this instance
    // UPDATE: Modified to filter keywords by the specific instance ID
    const { data: keywords, error: keywordsError } = await supabaseAdmin
      .from('whatsapp_support_keywords')
      .select('keyword, category')
      .eq('is_active', true)
      .eq('whatsapp_instance_id', businessInstanceId);
    
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

    // Step 5: Get support configuration - ALWAYS use the business instance ID
    const { data: supportConfig, error: configError } = await supabaseAdmin
      .from('whatsapp_support_config')
      .select('support_phone_number, escalation_message, notification_message')
      .eq('whatsapp_instance_id', businessInstanceId)
      .single();
    
    if (configError || !supportConfig) {
      console.error('Support config not found for business instance:', businessInstanceId, configError);
      return { success: false, error: 'Support config not found', details: configError, skip_ai_processing: false };
    }
    
    const { support_phone_number, escalation_message, notification_message } = supportConfig;
    
    if (!support_phone_number) {
      console.error('Support phone number not configured for business instance:', businessInstanceId);
      return { success: false, error: 'Support phone number not configured', skip_ai_processing: false };
    }

    // Step 6: Create escalation record with business instance ID
    const { data: escalation, error: escalationError } = await supabaseAdmin
      .from('whatsapp_escalated_conversations')
      .insert({
        whatsapp_instance_id: businessInstanceId, // Use business instance ID, never support instance
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

    // Step 7: Send message to customer using the business instance
    if (escalation_message) {
      try {
        // Use customer's phone number (phoneNumber) and ensure full URL with protocol
        const apiUrl = `${apiBaseUrl}/message/sendText/${businessInstanceName}`;
        console.log(`Sending escalation message to customer via business instance ${businessInstanceName} at URL: ${apiUrl}`);
        
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

    // Step 8: Notify support agent - Also use the business instance
    if (notification_message) {
      try {
        // Create a customized notification message with the customer message and other details
        const customNotification = `${notification_message}\n\nFrom: +${phoneNumber}\nKeyword: ${matchedKeyword}${keywordCategory ? `\nCategory: ${keywordCategory}` : ''}\nMessage: "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`;
        
        // Use the business instance to send to the support agent
        const apiUrl = `${apiBaseUrl}/message/sendText/${businessInstanceName}`;
        console.log(`Sending notification to support agent via business instance ${businessInstanceName} at URL: ${apiUrl}`);
        
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
      message: `Escalated conversation with ${phoneNumber} due to keyword "${matchedKeyword}" using business instance ${businessInstanceName}`,
      data: {
        business_instance: businessInstanceName,
        business_instance_id: businessInstanceId,
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
      skip_ai_processing: true
    };
  } catch (error) {
    console.error('Error processing message for escalation:', error);
    return { success: false, error: 'Internal error processing message', details: error, skip_ai_processing: false };
  }
}
