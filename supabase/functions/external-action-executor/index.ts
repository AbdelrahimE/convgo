import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface ExternalActionRequest {
  externalActionId: string;
  extractedVariables: Record<string, any>;
  whatsappConversationId?: string;
  whatsappMessageId?: string;
  intentConfidence?: number;
}

interface ExternalActionConfig {
  id: string;
  action_name: string;
  webhook_url: string;
  http_method: string;
  headers: Record<string, any>;
  payload_template: Record<string, any>;
  retry_attempts: number;
  timeout_seconds: number;
  response_type?: string;
  response_timeout_seconds?: number;
}

interface ExecutionResult {
  success: boolean;
  httpStatusCode?: number;
  responseData?: any;
  errorMessage?: string;
  executionTimeMs: number;
  retryCount: number;
  executionLogId?: string;
}

/**
 * Generate unique response URL for automation platforms
 */
function generateResponseUrl(executionLogId: string): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  return `${supabaseUrl}/functions/v1/external-action-response-handler`;
}

/**
 * Replace template variables in payload with extracted values
 */
function interpolateTemplate(
  template: Record<string, any>, 
  variables: Record<string, any>
): Record<string, any> {
  const result = JSON.parse(JSON.stringify(template));
  
  function replaceInObject(obj: any): any {
    if (typeof obj === 'string') {
      // Replace {{variable}} placeholders
      return obj.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return variables[varName] !== undefined ? variables[varName] : match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (obj !== null && typeof obj === 'object') {
      const newObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = replaceInObject(value);
      }
      return newObj;
    }
    return obj;
  }
  
  return replaceInObject(result);
}

/**
 * Execute webhook with retry logic
 */
async function executeWebhook(
  config: ExternalActionConfig,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  const startTime = Date.now();
  let lastError: string = '';
  
  for (let attempt = 0; attempt <= config.retry_attempts; attempt++) {
    try {
      logger.info(`🚀 Executing webhook attempt ${attempt + 1}/${config.retry_attempts + 1}:`, {
        actionName: config.action_name,
        method: config.http_method,
        url: config.webhook_url.substring(0, 50) + '...',
        payloadSize: JSON.stringify(payload).length
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout_seconds * 1000);
      
      const requestOptions: RequestInit = {
        method: config.http_method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ConvGo-ExternalActions/1.0',
          ...config.headers
        },
        signal: controller.signal
      };
      
      // Add body for methods that support it
      if (['POST', 'PUT', 'PATCH'].includes(config.http_method.toUpperCase())) {
        requestOptions.body = JSON.stringify(payload);
      }
      
      const response = await fetch(config.webhook_url, requestOptions);
      clearTimeout(timeoutId);
      
      const executionTime = Date.now() - startTime;
      
      // Try to parse response as JSON, fallback to text intelligently
      let responseData;
      const responseText = await response.text();
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        // Check if response is a common success text pattern
        const trimmedText = responseText.trim();
        const commonSuccessTexts = [
          'accepted', 'ok', 'success', 'received', 'processed', 
          'done', 'complete', 'completed', 'acknowledged', 'ack'
        ];
        
        const isCommonSuccessText = commonSuccessTexts.some(text => 
          trimmedText.toLowerCase() === text
        );
        
        if (response.ok && isCommonSuccessText) {
          // This is a successful plain text response, not an error
          responseData = {
            message: trimmedText,
            type: 'plain_text_success'
          };
          logger.info('Plain text success response detected:', {
            actionName: config.action_name,
            responseText: trimmedText,
            statusCode: response.status
          });
        } else {
          // This is likely a real parsing error or unexpected response
          responseData = { 
            rawResponse: responseText, 
            parseError: parseError.message,
            type: 'json_parse_error'
          };
          logger.debug('Response JSON parsing failed, storing as raw text:', {
            actionName: config.action_name,
            responseText: responseText.substring(0, 200),
            parseError: parseError.message
          });
        }
      }
      
      const result: ExecutionResult = {
        success: response.ok,
        httpStatusCode: response.status,
        responseData,
        executionTimeMs: executionTime,
        retryCount: attempt
      };
      
      // 🐛 ENHANCED LOGGING: Log response details for debugging
      logger.info(`📋 Webhook response details:`, {
        actionName: config.action_name,
        statusCode: response.status,
        statusText: response.statusText,
        responseOk: response.ok,
        executionTime,
        retryCount: attempt,
        responseType: typeof responseData,
        hasResponseData: !!responseData,
        responseDataPreview: responseData ? JSON.stringify(responseData).substring(0, 100) : 'null'
      });
      
      if (response.ok) {
        logger.info(`✅ Webhook executed successfully:`, {
          actionName: config.action_name,
          statusCode: response.status,
          statusText: response.statusText,
          executionTime,
          retryCount: attempt,
          responseDataSize: responseData ? JSON.stringify(responseData).length : 0
        });
        return result;
      } else {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        logger.warn(`⚠️ Webhook failed with status ${response.status}:`, {
          actionName: config.action_name,
          statusCode: response.status,
          statusText: response.statusText,
          attempt: attempt + 1,
          willRetry: attempt < config.retry_attempts
        });
        
        if (attempt === config.retry_attempts) {
          return {
            ...result,
            errorMessage: lastError
          };
        }
      }
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      lastError = error.message || 'Unknown error';
      
      logger.error(`❌ Webhook execution error on attempt ${attempt + 1}:`, {
        actionName: config.action_name,
        error: lastError,
        attempt: attempt + 1,
        executionTime,
        willRetry: attempt < config.retry_attempts
      });
      
      if (attempt === config.retry_attempts) {
        return {
          success: false,
          errorMessage: lastError,
          executionTimeMs: executionTime,
          retryCount: attempt
        };
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < config.retry_attempts) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  return {
    success: false,
    errorMessage: lastError || 'Max retries exceeded',
    executionTimeMs: Date.now() - startTime,
    retryCount: config.retry_attempts
  };
}

/**
 * Log execution result to database
 */
async function logExecution(
  actionId: string,
  request: ExternalActionRequest,
  result: ExecutionResult,
  payload: Record<string, any>,
  executionLogId: string
): Promise<string | null> {
  try {
    // Find the correct UUID for the WhatsApp message
    let correctMessageId = null;
    
    if (request.whatsappMessageId && request.whatsappConversationId) {
      try {
        const { data: messageRecord, error: messageError } = await supabaseAdmin
          .from('whatsapp_conversation_messages')
          .select('id')
          .eq('message_id', request.whatsappMessageId)
          .eq('conversation_id', request.whatsappConversationId)
          .single();
        
        if (messageError) {
          logger.warn('Could not find message record for logging:', {
            whatsappMessageId: request.whatsappMessageId,
            conversationId: request.whatsappConversationId,
            error: messageError.message
          });
        } else if (messageRecord) {
          correctMessageId = messageRecord.id;
          logger.debug('Found correct message UUID for logging:', {
            whatsappMessageId: request.whatsappMessageId,
            correctUUID: correctMessageId
          });
        }
      } catch (lookupError) {
        logger.warn('Exception while looking up message UUID:', {
          error: lookupError.message,
          whatsappMessageId: request.whatsappMessageId
        });
      }
    }
    
    const logData = {
      id: executionLogId, // UUID for tracking and foreign key compatibility
      external_action_id: actionId,
      whatsapp_conversation_id: request.whatsappConversationId,
      whatsapp_message_id: correctMessageId, // Use the correct UUID or null
      intent_confidence: request.intentConfidence,
      extracted_variables: request.extractedVariables,
      webhook_payload: payload,
      webhook_response: result.responseData,
      http_status_code: result.httpStatusCode,
      execution_status: result.success ? 'success' : 'failed',
      error_message: result.errorMessage,
      execution_time_ms: result.executionTimeMs,
      retry_count: result.retryCount,
      executed_at: new Date().toISOString()
    };
    
    const { error } = await supabaseAdmin
      .from('external_action_logs')
      .insert(logData);
    
    if (error) {
      logger.error('Failed to log execution result:', error);
      return null;
    } else {
      logger.info('✅ Execution result logged to database:', {
        executionLogId,
        executionStatus: logData.execution_status,
        httpStatusCode: logData.http_status_code,
        hasCorrectMessageId: !!correctMessageId,
        actionId: actionId
      });
      return executionLogId;
    }
  } catch (error) {
    logger.error('Exception while logging execution:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();
  
  try {
    const request = await req.json() as ExternalActionRequest;
    
    if (!request.externalActionId || !request.extractedVariables) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'externalActionId and extractedVariables are required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    logger.info('🎯 External Action Execution Started:', {
      actionId: request.externalActionId,
      variablesCount: Object.keys(request.extractedVariables).length,
      hasConversationId: !!request.whatsappConversationId,
      hasMessageId: !!request.whatsappMessageId,
      intentConfidence: request.intentConfidence
    });
    
    // Get external action configuration including V2 response settings
    const { data: actionConfig, error: configError } = await supabaseAdmin
      .from('external_actions')
      .select('*, response_type, response_timeout_seconds')
      .eq('id', request.externalActionId)
      .eq('is_active', true)
      .single();
    
    if (configError || !actionConfig) {
      logger.error('External action not found or inactive:', {
        actionId: request.externalActionId,
        error: configError
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'External action not found or inactive'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }
    
    logger.info('📋 Action configuration loaded:', {
      actionName: actionConfig.action_name,
      method: actionConfig.http_method,
      retryAttempts: actionConfig.retry_attempts,
      timeout: actionConfig.timeout_seconds,
      hasCustomHeaders: Object.keys(actionConfig.headers || {}).length > 0
    });
    
    // Generate execution log ID for response tracking - using UUID for database compatibility
    const executionLogId = crypto.randomUUID();
    
    // Interpolate payload template with extracted variables
    const interpolatedPayload = interpolateTemplate(
      actionConfig.payload_template,
      request.extractedVariables
    );
    
    // 🚀 EXTERNAL ACTIONS V2: Add response URL for wait_for_webhook actions
    if (actionConfig.response_type === 'wait_for_webhook') {
      interpolatedPayload._response_url = generateResponseUrl(executionLogId);
      interpolatedPayload._execution_id = executionLogId;
      
      logger.info('📡 Added response URL for wait_for_webhook action:', {
        executionLogId,
        responseUrl: interpolatedPayload._response_url,
        responseType: actionConfig.response_type
      });
    }
    
    logger.info('🔄 Payload interpolated:', {
      templateSize: JSON.stringify(actionConfig.payload_template).length,
      finalPayloadSize: JSON.stringify(interpolatedPayload).length,
      variablesUsed: Object.keys(request.extractedVariables),
      hasResponseUrl: !!interpolatedPayload._response_url
    });
    
    // Execute webhook
    const executionResult = await executeWebhook(actionConfig, interpolatedPayload);
    
    // Log execution result and get the log ID
    const loggedExecutionId = await logExecution(
      request.externalActionId,
      request,
      executionResult,
      interpolatedPayload,
      executionLogId
    );
    
    // Add execution log ID to result
    executionResult.executionLogId = loggedExecutionId;
    
    const totalProcessingTime = Date.now() - startTime;
    
    logger.info('🏁 External Action Execution Completed:', {
      actionName: actionConfig.action_name,
      success: executionResult.success,
      httpStatus: executionResult.httpStatusCode,
      executionTime: executionResult.executionTimeMs,
      retryCount: executionResult.retryCount,
      totalProcessingTime,
      hasResponse: !!executionResult.responseData
    });
    
    return new Response(
      JSON.stringify({
        success: executionResult.success,
        actionName: actionConfig.action_name,
        httpStatusCode: executionResult.httpStatusCode,
        executionTimeMs: executionResult.executionTimeMs,
        retryCount: executionResult.retryCount,
        totalProcessingTimeMs: totalProcessingTime,
        responseData: executionResult.responseData,
        errorMessage: executionResult.errorMessage,
        executionLogId: executionResult.executionLogId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('❌ Critical Error in External Action Execution:', {
      error: error.message || error,
      stack: error.stack,
      processingTime
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        processingTimeMs: processingTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});