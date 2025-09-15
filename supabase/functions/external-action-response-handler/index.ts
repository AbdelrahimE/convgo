import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Default API URL for WhatsApp API
const DEFAULT_EVOLUTION_API_URL = 'https://api.botifiy.com';

interface ResponseRequest {
  execution_log_id: string;  // UUID from external_action_logs or execution ID
  response_message: string;   // The message to send to user
  response_data?: any;        // Optional additional data
  status?: 'success' | 'error';
}

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Find pending response record by execution log ID
 */
async function findPendingResponse(executionLogId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('external_action_responses')
      .select('*')
      .eq('execution_log_id', executionLogId)
      .eq('response_received', false)
      .single();

    if (error) {
      logger.error('Error finding pending response:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Exception finding pending response:', error);
    return null;
  }
}

/**
 * Update response record with received response
 */
async function updateResponseRecord(executionLogId: string, updateData: {
  response_received: boolean;
  response_message: string;
  response_data?: any;
  received_at: Date;
}) {
  try {
    const { error } = await supabaseAdmin
      .from('external_action_responses')
      .update({
        response_received: updateData.response_received,
        response_message: updateData.response_message,
        response_data: updateData.response_data,
        received_at: updateData.received_at.toISOString()
      })
      .eq('execution_log_id', executionLogId);

    if (error) {
      logger.error('Error updating response record:', error);
      throw error;
    }

    logger.info('✅ Response record updated successfully:', { executionLogId });
  } catch (error) {
    logger.error('Exception updating response record:', error);
    throw error;
  }
}

/**
 * Store message in conversation
 */
async function storeMessageInConversation(
  conversationId: string, 
  senderType: string, 
  content: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        content: content,
        message_id: `webhook_response_${Date.now()}`,
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Error storing message in conversation:', error);
      throw error;
    }

    logger.info('✅ Message stored in conversation successfully');
  } catch (error) {
    logger.error('Exception storing message in conversation:', error);
    throw error;
  }
}

/**
 * Send WhatsApp message via Evolution API
 */
async function sendWhatsAppMessage(
  userPhone: string, 
  message: string, 
  instanceName: string
) {
  try {
    // Get instance configuration for API endpoint
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instance) {
      logger.error('Failed to get instance data:', instanceError);
      throw new Error('Instance not found');
    }

    // Get webhook config for API URL
    const { data: webhookConfig, error: webhookError } = await supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('webhook_url')
      .eq('whatsapp_instance_id', instance.id)
      .maybeSingle();

    let instanceBaseUrl = DEFAULT_EVOLUTION_API_URL;
    
    if (!webhookError && webhookConfig?.webhook_url) {
      const url = new URL(webhookConfig.webhook_url);
      instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    }

    const sendMessageUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
    const sendMessagePayload = {
      number: userPhone,
      text: message
    };

    logger.info('📤 Sending webhook response message to WhatsApp:', {
      sendMessageUrl,
      userPhone,
      messagePreview: message.substring(0, 100)
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
      logger.error('❌ Failed to send WhatsApp message:', {
        status: response.status,
        error: errorText,
        sendMessageUrl,
        userPhone
      });
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    const responseData = await response.json();
    logger.info('✅ WhatsApp message sent successfully:', {
      userPhone,
      responseData
    });

  } catch (error) {
    logger.error('Exception sending WhatsApp message:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    logger.info('🔄 External Action Response Handler - Processing incoming request');
    
    const requestBody = await req.json();
    const { execution_log_id, response_message, response_data, status } = requestBody;

    // Validate required parameters
    if (!execution_log_id || !response_message) {
      logger.error('❌ Missing required parameters:', {
        execution_log_id: !!execution_log_id,
        response_message: !!response_message,
        requestBody
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters: execution_log_id and response_message are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    logger.info('📋 Processing webhook response:', {
      execution_log_id,
      response_message_preview: response_message.substring(0, 100),
      has_response_data: !!response_data,
      status: status || 'success'
    });
    
    // 1. Find pending response record
    const pendingResponse = await findPendingResponse(execution_log_id);
    
    if (!pendingResponse) {
      logger.warn('⚠️ No pending response found:', { execution_log_id });
      return new Response(
        JSON.stringify({ 
          error: 'No pending response found or already processed',
          execution_log_id 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // 2. Check if not expired
    const now = new Date();
    const expiresAt = new Date(pendingResponse.expires_at);
    
    if (now > expiresAt) {
      logger.warn('⏰ Response timeout exceeded:', {
        execution_log_id,
        now: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        expired_minutes_ago: Math.round((now.getTime() - expiresAt.getTime()) / (1000 * 60))
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Response timeout exceeded',
          execution_log_id,
          expired_at: expiresAt.toISOString()
        }),
        { 
          status: 408, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // 3. Send message to WhatsApp
    await sendWhatsAppMessage(
      pendingResponse.user_phone,
      response_message,
      pendingResponse.instance_name
    );
    
    // 4. Update response record
    await updateResponseRecord(execution_log_id, {
      response_received: true,
      response_message,
      response_data,
      received_at: now
    });
    
    // 5. Store in conversation
    await storeMessageInConversation(
      pendingResponse.conversation_id,
      'assistant',
      response_message
    );
    
    logger.info('✅ External Action webhook response processed successfully:', {
      execution_log_id,
      user_phone: pendingResponse.user_phone,
      instance_name: pendingResponse.instance_name,
      processing_time_ms: Date.now() - new Date(pendingResponse.created_at).getTime()
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Response sent successfully',
        execution_log_id,
        sent_to: pendingResponse.user_phone,
        sent_at: now.toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    logger.error('💥 Error processing webhook response:', {
      error: error.message || error,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message || 'Unknown error occurred'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});