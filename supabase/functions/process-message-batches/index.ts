
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAndSendAIResponse } from "../_shared/ai-response-generator.ts";
import { logger, logDebug } from "../_shared/logger.ts";

// Define standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role for admin operations
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

try {
  // Log info about environment only if logging is enabled
  logger.log(`Starting process-message-batches function with URL: ${supabaseUrl}`);
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Helper function to get conversation history
  async function getRecentConversationHistory(conversationId: string, maxTokens = 1000) {
    try {
      // Get message count first to determine how many to fetch
      const { data: countData, error: countError } = await supabaseAdmin
        .from('whatsapp_conversation_messages')
        .select('id', { count: 'exact' })
        .eq('conversation_id', conversationId);
      
      if (countError) throw countError;
      
      // Calculate how many messages to fetch (estimate 50 tokens per message on average)
      const messageCount = countData || 0;
      const estimatedMessagesToFetch = Math.min(Math.floor(maxTokens / 50), messageCount, 10);
      
      // Always include at least 3 messages if available
      const messagesToFetch = Math.max(estimatedMessagesToFetch, Math.min(3, messageCount));
      
      // Fetch the messages
      const { data, error } = await supabaseAdmin
        .from('whatsapp_conversation_messages')
        .select('role, content, timestamp')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: false })
        .limit(messagesToFetch);

      if (error) throw error;
      
      // Log the conversation history retrieval using imported logDebug
      await logDebug('BATCH_CONVERSATION_HISTORY', `Retrieved ${data.length} messages from conversation ${conversationId}`, {
        messageCount: data.length,
        maxTokensAllowed: maxTokens,
        estimatedTokensUsed: data.reduce((sum, msg) => sum + Math.ceil(msg.content.length * 0.25), 0)
      });
      
      return data.reverse();
    } catch (error) {
      logger.error('Error in getRecentConversationHistory:', error);
      
      await logDebug('BATCH_CONVERSATION_HISTORY_ERROR', `Error retrieving conversation history: ${error.message}`, {
        error: error.toString(),
        stack: error.stack,
        conversationId
      });
      return [];
    }
  }

  // Process batched messages - Enhanced version that properly handles the batch
  async function processBatchedConversations() {
    try {
      logger.log("Starting processBatchedConversations function");
      
      // Find active conversations with unprocessed messages
      const { data: activeConversations, error: conversationsError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .select('id, instance_id, user_phone')
        .eq('status', 'active');

      if (conversationsError) {
        await logDebug('BATCH_FIND_CONVERSATIONS_ERROR', 'Error finding active conversations', { 
          error: conversationsError.message,
          details: conversationsError 
        });
        return false;
      }

      if (!activeConversations || activeConversations.length === 0) {
        await logDebug('BATCH_NO_CONVERSATIONS', 'No active conversations found to process');
        return true; // No active conversations to process
      }

      await logDebug('BATCH_PROCESS_START', `Processing ${activeConversations.length} active conversations for batched messages`);

      // Process each conversation
      for (const conversation of activeConversations) {
        try {
          // Define the timestamp threshold (messages older than 5 seconds)
          const fiveSecondsAgo = new Date(Date.now() - 5000);
          
          // Call the SQL function to process the batch with a transaction
          logger.log(`Processing batch for conversation: ${conversation.id}`);
          const { data: batchResult, error: batchError } = await supabaseAdmin.rpc('process_message_batch', {
            p_conversation_id: conversation.id,
            p_timestamp_threshold: fiveSecondsAgo.toISOString()
          });

          if (batchError) {
            await logDebug('BATCH_PROCESSING_ERROR', `Error processing batch for conversation ${conversation.id}`, { 
              conversationId: conversation.id, 
              error: batchError.message,
              details: batchError 
            });
            continue; // Skip to the next conversation
          }

          // If no batched messages found, skip to the next conversation
          if (!batchResult || !batchResult.success || !batchResult.messages || batchResult.messages.length === 0) {
            await logDebug('BATCH_NO_MESSAGES', `No messages to process for conversation ${conversation.id}`);
            continue;
          }

          await logDebug('BATCH_FOUND', `Found ${batchResult.messages.length} batched messages for conversation ${conversation.id}`, {
            messages: batchResult.messages
          });

          // Process the batched messages
          await processBatchedMessages(conversation, batchResult);
        } catch (conversationError) {
          await logDebug('BATCH_CONVERSATION_ERROR', `Error processing conversation ${conversation.id}`, {
            error: conversationError.toString(),
            stack: conversationError.stack,
            conversation: conversation
          });
        }
      }

      return true;
    } catch (error) {
      await logDebug('BATCH_PROCESS_EXCEPTION', 'Unhandled exception in batch processing', { 
        error: error.toString(),
        stack: error.stack 
      });
      return false;
    }
  }

  // Process a specific batch of messages
  async function processBatchedMessages(conversation: any, batchResult: any) {
    try {
      logger.log(`Processing batched messages for conversation: ${conversation.id}`);
      
      // Get the WhatsApp instance details
      const { data: instanceData, error: instanceError } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('id', conversation.instance_id)
        .single();

      if (instanceError || !instanceData) {
        await logDebug('BATCH_INSTANCE_ERROR', 'Error getting instance data for batch processing', { 
          conversationId: conversation.id, 
          error: instanceError ? instanceError.message : 'No instance data returned',
          details: instanceError 
        });
        return;
      }

      // Check if AI is enabled for this instance
      const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
        .from('whatsapp_ai_config')
        .select('*')
        .eq('whatsapp_instance_id', instanceData.id)
        .eq('is_active', true)
        .maybeSingle();

      if (aiConfigError) {
        await logDebug('BATCH_AI_CONFIG_ERROR', 'Error checking AI config', { 
          instanceId: instanceData.id, 
          error: aiConfigError.message,
          details: aiConfigError 
        });
        return;
      }

      if (!aiConfig) {
        await logDebug('BATCH_AI_DISABLED', 'AI is not enabled for this instance', { 
          instanceId: instanceData.id 
        });
        return;
      }

      // Get conversation history
      const conversationHistory = await getRecentConversationHistory(conversation.id, 800);

      // Combine all message contents
      const combinedContent = batchResult.messages.map(m => m.content).join('\n');
      await logDebug('BATCH_COMBINED_CONTENT', 'Combined batched messages', { 
        combinedContent, 
        messageCount: batchResult.messages.length 
      });

      // Get files associated with this instance for RAG
      const { data: fileMappings, error: fileMappingsError } = await supabaseAdmin
        .from('whatsapp_file_mappings')
        .select('file_id')
        .eq('whatsapp_instance_id', instanceData.id);

      if (fileMappingsError) {
        await logDebug('BATCH_FILE_MAPPING_ERROR', 'Error getting file mappings', { 
          instanceId: instanceData.id, 
          error: fileMappingsError.message,
          details: fileMappingsError 
        });
        return;
      }

      // Extract file IDs
      const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];

      // Determine Evolution API URL
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
      
      let instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://api.convgo.com';

      try {
        // Try to get webhook config
        const { data: webhookConfig, error: webhookError } = await supabaseAdmin
          .from('whatsapp_webhook_config')
          .select('webhook_url')
          .eq('whatsapp_instance_id', instanceData.id)
          .maybeSingle();
          
        if (!webhookError && webhookConfig && webhookConfig.webhook_url) {
          // Extract base URL from webhook URL
          const url = new URL(webhookConfig.webhook_url);
          instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          await logDebug('BATCH_URL_DETERMINED', `Using webhook URL to determine base URL: ${instanceBaseUrl}`);
        } else if (webhookError) {
          await logDebug('BATCH_WEBHOOK_CONFIG_ERROR', 'Error getting webhook config', { 
            error: webhookError.message,
            details: webhookError 
          });
        }
      } catch (urlError) {
        // Use default URL on error
        await logDebug('BATCH_URL_ERROR', 'Error determining EVOLUTION API URL, using default', { 
          error: urlError.toString(),
          stack: urlError.stack,
          instanceBaseUrl 
        });
      }

      // Perform semantic search for context
      let context = '';
      
      try {
        logger.log(`Calling semantic search endpoint with ${fileIds.length} file IDs`);
        const searchResponse = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            query: combinedContent,
            fileIds: fileIds.length > 0 ? fileIds : undefined,
            limit: 5,
            threshold: 0.3
          })
        });

        if (!searchResponse.ok) {
          await logDebug('BATCH_SEARCH_ERROR_RESPONSE', 'Error response from semantic search', {
            status: searchResponse.status,
            statusText: searchResponse.statusText,
            responseText: await searchResponse.text()
          });
          throw new Error(`Semantic search API returned status ${searchResponse.status}`);
        }

        const searchResults = await searchResponse.json();
        
        if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
          // Format conversation history
          const conversationContext = conversationHistory
            .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n');
            
          // Format RAG results
          const topResults = searchResults.results.slice(0, 3);
          const ragContext = topResults
            .map((result, index) => `DOCUMENT ${index + 1} (similarity: ${result.similarity.toFixed(2)}):\n${result.content.trim()}`)
            .join('\n\n---\n\n');
            
          // Combine contexts
          context = `${conversationContext}\n\n${ragContext}`;
          
          await logDebug('BATCH_CONTEXT_ASSEMBLED', 'Enhanced context assembled for token balancing', { 
            conversationChars: conversationContext.length,
            ragChars: ragContext.length,
            totalChars: context.length,
            estimatedTokens: Math.ceil(context.length * 0.25)
          });
        } else {
          // Only conversation history
          context = conversationHistory
            .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n');
            
          await logDebug('BATCH_CONTEXT_CONVERSATION_ONLY', 'Context assembled with only conversation history', { 
            chars: context.length,
            estimatedTokens: Math.ceil(context.length * 0.25)
          });
        }
      } catch (searchError) {
        await logDebug('BATCH_SEARCH_ERROR', 'Error performing semantic search', { 
          error: searchError.toString(),
          stack: searchError.stack 
        });
        
        // Fallback to conversation history only
        context = conversationHistory
          .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join('\n\n');
      }

      // Generate and send AI response
      await logDebug('BATCH_GENERATING_RESPONSE', 'Generating AI response for batched messages');
      
      try {
        logger.log(`Calling generateAndSendAIResponse for ${conversation.user_phone}`);
        const result = await generateAndSendAIResponse(
          combinedContent,
          context,
          instanceData.instance_name,
          conversation.user_phone,
          instanceBaseUrl,
          aiConfig,
          { key: { id: batchResult.messages[0].message_id } }, // Use first message ID
          conversation.id,
          supabaseUrl,
          supabaseServiceKey
        );

        await logDebug('BATCH_RESPONSE_SENT', 'AI response sent for batched messages', { 
          result,
          conversationId: conversation.id,
          messageCount: batchResult.messages.length
        });

        return result;
      } catch (responseError) {
        await logDebug('BATCH_RESPONSE_GENERATION_ERROR', 'Error generating/sending AI response', {
          error: responseError.toString(),
          stack: responseError.stack,
          combinedContent,
          conversationId: conversation.id
        });
        throw responseError;
      }
    } catch (error) {
      await logDebug('BATCH_MESSAGE_PROCESS_ERROR', 'Error processing batched messages', { 
        error: error.toString(),
        stack: error.stack,
        conversation: conversation?.id
      });
      return false;
    }
  }

  // Main handler
  serve(async (req) => {
    logger.log(`Received request: ${req.method} ${req.url}`);
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      await logDebug('BATCH_PROCESS_TRIGGERED', 'Message batch processing job started');
      
      // Process all batched conversations
      const result = await processBatchedConversations();
      
      await logDebug('BATCH_PROCESS_COMPLETED', 'Message batch processing completed', { success: result });
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Batch processing completed'
        }),
        { 
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      logger.error('CRITICAL ERROR in batch processing:', error);
      
      await logDebug('BATCH_PROCESS_FAILED', 'Message batch processing failed', { 
        error: error.toString(),
        stack: error.stack 
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Unknown error'
        }),
        { 
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
  });
} catch (initError) {
  logger.error('CRITICAL ERROR during initialization:', initError);
  
  // Set up a basic handler that will return the error information
  serve(async (req) => {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Initialization error',
        details: initError.toString(),
        stack: initError.stack
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  });
}
