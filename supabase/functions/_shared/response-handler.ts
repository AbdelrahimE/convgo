/**
 * Shared response handling utilities for External Actions V2
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Get expired pending responses that need timeout handling
 */
export async function getExpiredPendingResponses() {
  try {
    const { data: expired, error } = await supabaseAdmin
      .from('external_action_responses')
      .select('*')
      .eq('response_received', false)
      .lt('expires_at', new Date().toISOString())
      .limit(50); // Process in batches

    if (error) {
      logger.error('Error getting expired pending responses:', error);
      return [];
    }

    logger.info('Found expired pending responses:', {
      count: expired?.length || 0,
      expiredIds: expired?.map(r => r.execution_log_id) || []
    });

    return expired || [];
  } catch (error) {
    logger.error('Exception getting expired pending responses:', error);
    return [];
  }
}

/**
 * Mark response as expired/handled
 */
export async function markResponseAsExpired(responseId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('external_action_responses')
      .update({
        response_received: true, // Mark as received to prevent reprocessing
        response_message: 'TIMEOUT_EXPIRED',
        received_at: new Date().toISOString()
      })
      .eq('id', responseId);

    if (error) {
      logger.error('Error marking response as expired:', error);
      throw error;
    }

    logger.info('✅ Response marked as expired:', { responseId });
  } catch (error) {
    logger.error('Exception marking response as expired:', error);
    throw error;
  }
}

/**
 * Send timeout message to WhatsApp
 */
export async function sendTimeoutMessage(
  userPhone: string,
  instanceName: string,
  customTimeoutMessage?: string
) {
  try {
    // Get instance configuration for API endpoint
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instance) {
      logger.error('Failed to get instance data for timeout message:', instanceError);
      throw new Error('Instance not found');
    }

    // Get webhook config for API URL
    const { data: webhookConfig, error: webhookError } = await supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('webhook_url')
      .eq('whatsapp_instance_id', instance.id)
      .maybeSingle();

    let instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || '';

    if (!webhookError && webhookConfig?.webhook_url) {
      const url = new URL(webhookConfig.webhook_url);
      instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    }

    const timeoutMessage = customTimeoutMessage || 
      'عذراً، انتهت مهلة الاستجابة. يرجى المحاولة مرة أخرى.';

    const sendMessageUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
    const sendMessagePayload = {
      number: userPhone,
      text: timeoutMessage
    };

    logger.info('📤 Sending timeout message:', {
      sendMessageUrl,
      userPhone,
      timeoutMessage: timeoutMessage.substring(0, 50) + '...'
    });

    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('EVOLUTION_API_KEY') || ''
      },
      body: JSON.stringify(sendMessagePayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Failed to send timeout message:', {
        status: response.status,
        error: errorText,
        sendMessageUrl,
        userPhone
      });
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    logger.info('✅ Timeout message sent successfully:', { userPhone });

  } catch (error) {
    logger.error('Exception sending timeout message:', error);
    throw error;
  }
}

/**
 * Store timeout message in conversation
 */
export async function storeTimeoutMessageInConversation(
  conversationId: string, 
  timeoutMessage: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: timeoutMessage,
        message_id: `timeout_${Date.now()}`
      });

    if (error) {
      logger.error('Error storing timeout message in conversation:', error);
      throw error;
    }

    logger.info('✅ Timeout message stored in conversation');
  } catch (error) {
    logger.error('Exception storing timeout message in conversation:', error);
    throw error;
  }
}

/**
 * Handle expired responses - main function for timeout processing
 */
export async function handleExpiredResponses(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    logger.info('🕐 Starting expired response handling...');

    const expiredResponses = await getExpiredPendingResponses();
    
    if (expiredResponses.length === 0) {
      logger.info('No expired responses to process');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    logger.info(`Processing ${expiredResponses.length} expired responses...`);

    for (const response of expiredResponses) {
      processed++;
      
      try {
        logger.info('Processing expired response:', {
          executionLogId: response.execution_log_id,
          userPhone: response.user_phone,
          instanceName: response.instance_name,
          expiredAt: response.expires_at,
          createdAt: response.created_at
        });

        // Send timeout message
        const timeoutMessage = 'عذراً، انتهت مهلة الاستجابة للطلب. يرجى المحاولة مرة أخرى.';
        
        await sendTimeoutMessage(
          response.user_phone,
          response.instance_name,
          timeoutMessage
        );
        
        // Store in conversation
        await storeTimeoutMessageInConversation(
          response.conversation_id,
          timeoutMessage
        );
        
        // Mark as expired
        await markResponseAsExpired(response.id);
        
        succeeded++;
        
        logger.info('✅ Expired response handled successfully:', {
          executionLogId: response.execution_log_id,
          userPhone: response.user_phone
        });
        
      } catch (error) {
        failed++;
        logger.error('❌ Failed to handle expired response:', {
          executionLogId: response.execution_log_id,
          userPhone: response.user_phone,
          error: error.message
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    logger.info('🏁 Expired response handling completed:', {
      totalProcessed: processed,
      succeeded,
      failed,
      processingTimeMs: processingTime,
      successRate: `${Math.round((succeeded / processed) * 100)}%`
    });

    return { processed, succeeded, failed };

  } catch (error) {
    logger.error('💥 Critical error in expired response handling:', error);
    return { processed, succeeded, failed };
  }
}