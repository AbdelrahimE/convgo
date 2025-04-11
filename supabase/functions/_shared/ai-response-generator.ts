
import logDebug from "./webhook-logger.ts";
import { storeMessageInConversation } from "./conversation-storage.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BufferedMessage } from "./message-buffer.ts";

/**
 * Generates an AI response based on user query and context, then sends it via WhatsApp
 * 
 * @param query The user's message or query
 * @param context Conversation context and/or RAG content
 * @param instanceName The WhatsApp instance name
 * @param fromNumber The user's phone number
 * @param instanceBaseUrl Base URL for the WhatsApp API
 * @param aiConfig AI configuration for the instance
 * @param messageData Original message data for metadata
 * @param conversationId The conversation ID for storing the response
 * @param supabaseUrl Supabase project URL
 * @param supabaseServiceKey Supabase service role key
 * @param imageUrl Optional image URL for vision capabilities
 * @returns Promise<boolean> Success status of the operation
 */
export async function generateAndSendAIResponse(
  query: string,
  context: string,
  instanceName: string,
  fromNumber: string,
  instanceBaseUrl: string,
  aiConfig: any,
  messageData: any,
  conversationId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  imageUrl?: string | null
): Promise<boolean> {
  try {
    // Validate required parameters
    if (!supabaseUrl || !supabaseServiceKey) {
      await logDebug('AI_MISSING_PARAMS', 'Missing required Supabase parameters', {
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseServiceKey
      });
      console.error('Missing required Supabase parameters');
      return false;
    }
    
    if (!instanceName || !fromNumber) {
      await logDebug('AI_MISSING_PARAMS', 'Missing required message parameters', {
        hasInstanceName: !!instanceName,
        hasFromNumber: !!fromNumber
      });
      console.error('Missing required message parameters');
      return false;
    }
    
    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Generate system prompt
    await logDebug('AI_SYSTEM_PROMPT', 'Using system prompt from configuration', { 
      userSystemPrompt: aiConfig?.system_prompt
    });
    
    const systemPrompt = aiConfig?.system_prompt || "You are a helpful AI assistant that provides concise and accurate information.";

    // Generate AI response with improved token management and include imageUrl
    await logDebug('AI_RESPONSE_GENERATION', 'Generating AI response with token management', {
      hasImageUrl: !!imageUrl
    });
    const responseGenResponse = await fetch(`${supabaseUrl}/functions/v1/generate-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        query: query,
        context: context,
        systemPrompt: systemPrompt,
        temperature: aiConfig?.temperature || 0.7,
        model: 'gpt-4o-mini',
        maxContextTokens: 3000, // Explicit token limit
        imageUrl: imageUrl, // Pass the image URL if available
        userId: aiConfig?.user_id || null
      })
    });

    if (!responseGenResponse.ok) {
      const errorText = await responseGenResponse.text();
      await logDebug('AI_RESPONSE_ERROR', 'AI response generation failed', {
        status: responseGenResponse.status,
        error: errorText
      });
      console.error('AI response generation failed:', errorText);
      return false;
    }

    const responseData = await responseGenResponse.json();
    await logDebug('AI_RESPONSE_GENERATED', 'AI response generated successfully', {
      responsePreview: responseData.answer?.substring(0, 100) + '...',
      tokens: responseData.usage
    });

    // Log token usage if available
    if (responseData.tokenUsage) {
      await logDebug('AI_TOKEN_USAGE', 'Token usage details', responseData.tokenUsage);
    }

    // Store AI response in conversation history
    if (responseData.answer) {
      await storeMessageInConversation(conversationId, 'assistant', responseData.answer, undefined, supabaseAdmin);
    }

    // Save interaction to database
    try {
      await logDebug('AI_SAVING_INTERACTION', 'Saving AI interaction to database');
      
      const { error: interactionError } = await supabaseAdmin
        .from('whatsapp_ai_interactions')
        .insert({
          whatsapp_instance_id: aiConfig.whatsapp_instance_id,
          user_phone: fromNumber,
          user_message: query,
          ai_response: responseData.answer,
          prompt_tokens: responseData.usage?.prompt_tokens || 0,
          completion_tokens: responseData.usage?.completion_tokens || 0,
          total_tokens: responseData.usage?.total_tokens || 0,
          context_token_count: Math.ceil((context?.length || 0) / 4),
          search_result_count: context ? 1 : 0,
          response_model: responseData.model || 'gpt-4o-mini'
        });

      if (interactionError) {
        await logDebug('AI_INTERACTION_SAVE_ERROR', 'Error saving AI interaction', {
          error: interactionError
        });
        console.error('Error saving AI interaction:', interactionError);
      } else {
        await logDebug('AI_INTERACTION_SAVED', 'AI interaction saved successfully');
      }
    } catch (error) {
      await logDebug('AI_INTERACTION_SAVE_EXCEPTION', 'Exception saving AI interaction', {
        error
      });
      console.error('Exception saving AI interaction:', error);
    }

    // Send response back through WhatsApp
    if (instanceBaseUrl && fromNumber && responseData.answer) {
      await logDebug('AI_SENDING_RESPONSE', 'Sending AI response to WhatsApp', {
        instanceName,
        toNumber: fromNumber,
        baseUrl: instanceBaseUrl
      });
      
      // Determine Evolution API key
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      if (!evolutionApiKey) {
        await logDebug('AI_MISSING_API_KEY', 'EVOLUTION_API_KEY environment variable not set and no apikey in payload');
        console.error('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
        return false;
      }

      // Construct the send message URL according to EVOLUTION API format
      const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
      await logDebug('AI_RESPONSE_URL', 'Constructed send message URL', { sendUrl });
      
      try {
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: fromNumber,
            text: responseData.answer
          })
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          await logDebug('AI_SEND_RESPONSE_ERROR', 'Error sending WhatsApp message', {
            status: sendResponse.status,
            error: errorText,
            sendUrl,
            headers: {
              'Content-Type': 'application/json',
              'apikey': '[REDACTED]'
            },
            body: {
              number: fromNumber,
              text: responseData.answer.substring(0, 50) + '...'
            }
          });
          console.error('Error sending WhatsApp message:', errorText);
          return false;
        }

        const sendResult = await sendResponse.json();
        await logDebug('AI_RESPONSE_SENT', 'WhatsApp message sent successfully', { sendResult });
        return true;
      } catch (error) {
        await logDebug('AI_SEND_EXCEPTION', 'Exception sending WhatsApp message', { 
          error,
          sendUrl, 
          instanceBaseUrl,
          fromNumber
        });
        console.error('Exception sending WhatsApp message:', error);
        return false;
      }
    } else {
      await logDebug('AI_SEND_MISSING_DATA', 'Missing data for sending WhatsApp message', {
        hasInstanceBaseUrl: !!instanceBaseUrl,
        hasFromNumber: !!fromNumber,
        hasResponse: !!responseData.answer
      });
      return false;
    }
  } catch (error) {
    await logDebug('AI_GENERATE_SEND_EXCEPTION', 'Exception in generate and send function', { error });
    return false;
  }
}

/**
 * Process multiple buffered messages and generate a single AI response
 * This is an enhanced version that handles combined messages from the buffer
 * 
 * @param bufferedMessages Array of buffered messages to process together
 * @param context Conversation context and/or RAG content
 * @param instanceName The WhatsApp instance name
 * @param fromNumber The user's phone number
 * @param instanceBaseUrl Base URL for the WhatsApp API
 * @param aiConfig AI configuration for the instance
 * @param conversationId The conversation ID for storing the response
 * @param supabaseUrl Supabase project URL
 * @param supabaseServiceKey Supabase service role key
 * @returns Promise<boolean> Success status of the operation
 */
export async function processBufferedMessages(
  bufferedMessages: BufferedMessage[],
  context: string = "",
  instanceName?: string,
  fromNumber?: string,
  instanceBaseUrl?: string,
  aiConfig: any = {},
  conversationId?: string,
  supabaseUrl?: string,
  supabaseServiceKey?: string
): Promise<boolean> {
  try {
    // Validate critical parameters
    if (!supabaseUrl || !supabaseServiceKey) {
      await logDebug('BUFFER_PROCESS_MISSING_PARAMS', 'Missing required Supabase parameters', {
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseServiceKey
      });
      console.error('Missing required Supabase parameters for processing buffered messages');
      return false;
    }
    
    // If no messages in buffer, nothing to do
    if (!bufferedMessages || bufferedMessages.length === 0) {
      await logDebug('BUFFER_PROCESS_EMPTY', 'No messages in buffer to process');
      return false;
    }
    
    // Extract parameters from first message if not provided
    const firstMessage = bufferedMessages[0];
    instanceName = instanceName || firstMessage.instanceName;
    fromNumber = fromNumber || firstMessage.fromNumber;
    
    // Verify we have the essential parameters
    if (!instanceName || !fromNumber) {
      await logDebug('BUFFER_PROCESS_MISSING_PARAMS', 'Missing required messaging parameters', {
        hasInstanceName: !!instanceName,
        hasFromNumber: !!fromNumber
      });
      console.error('Missing required messaging parameters for processing buffered messages');
      return false;
    }
    
    // Generate a unique batch ID for tracking this group of messages
    const batchId = `${instanceName}:${fromNumber}:${Date.now()}`;
    
    // Log the process start with clear batch identification
    await logDebug('BUFFER_BATCH_PROCESSING_START', 'Starting batch processing of buffered messages', {
      batchId,
      messageCount: bufferedMessages.length,
      instanceName,
      fromNumber,
      messageIds: bufferedMessages.map(m => m.messageId).join(',')
    });
    
    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Detailed logging about the batch before processing
    await logDebug('BUFFER_PROCESSING_DETAILS', 'Processing buffered message batch details', {
      messageCount: bufferedMessages.length,
      instanceName,
      fromNumber,
      messageTimestamps: bufferedMessages.map(m => m.timestamp),
      messageContents: bufferedMessages.map(m => m.messageText ? (m.messageText.substring(0, 30) + '...') : '[NO_TEXT]'),
      hasImages: bufferedMessages.some(m => !!m.imageUrl)
    });
    
    // Sort messages by timestamp to ensure correct chronological order
    const sortedMessages = [...bufferedMessages].sort((a, b) => a.timestamp - b.timestamp);
    
    // Make sure we have a conversation ID
    if (!conversationId) {
      try {
        // Try to find the instance ID from the database
        const { data: instanceData } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id')
          .eq('instance_name', instanceName)
          .maybeSingle();
          
        // Get or create a conversation
        conversationId = await findOrCreateConversation(
          instanceData?.id || instanceName,
          fromNumber
        );
        
        await logDebug('BUFFER_CREATED_CONVERSATION', 'Created conversation for buffered messages', {
          conversationId,
          instanceName,
          fromNumber
        });
      } catch (error) {
        // Create a fallback conversation ID
        conversationId = `fallback_${instanceName}_${fromNumber}_${Date.now()}`;
        
        await logDebug('BUFFER_CONVERSATION_ERROR', 'Error creating conversation, using fallback', {
          conversationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Combine text from all messages with improved formatting
    let combinedText = '';
    let imageUrlToUse: string | null = null;
    let imageCount = 0;
    
    // Save each message in the conversation history and build combined text with timestamps
    for (let i = 0; i < sortedMessages.length; i++) {
      const message = sortedMessages[i];
      const messageTime = new Date(message.timestamp).toISOString();
      
      // Store each individual message in conversation history
      if (message.messageText) {
        await storeMessageInConversation(
          conversationId, 
          'user', 
          message.messageText, 
          message.messageId, 
          supabaseAdmin
        );
        
        // Add to combined text with timestamps and separators
        if (combinedText) {
          combinedText += '\n---\n'; // Clear separator between messages
        }
        
        // Add timestamp for better context
        combinedText += `[${messageTime.substring(11, 19)}] ${message.messageText}`;
      }
      
      // Track images in the batch - we'll use the last image for vision capabilities
      if (message.imageUrl) {
        imageCount++;
        imageUrlToUse = message.imageUrl;
        
        // If this is an image-only message with no text, add a placeholder with timestamp
        if (!message.messageText) {
          if (combinedText) {
            combinedText += '\n---\n';
          }
          combinedText += `[${messageTime.substring(11, 19)}] [IMAGE SENT]`;
        } else if (!combinedText.includes("[IMAGE SENT]")) {
          // If there's already text for this message, append image indicator
          combinedText += ' [WITH IMAGE]';
        }
      }
    }
    
    // Log the combined message details
    await logDebug('BUFFER_COMBINED_MESSAGE', 'Created combined message from buffer batch', {
      batchId,
      originalCount: sortedMessages.length,
      combinedLength: combinedText.length,
      imageCount,
      hasImage: !!imageUrlToUse,
      preview: combinedText.substring(0, 100) + (combinedText.length > 100 ? '...' : '')
    });
    
    // Add batch processing context to combined message if multiple messages
    if (sortedMessages.length > 1) {
      const batchContext = `\n\n[This is a combined batch of ${sortedMessages.length} messages sent within ${Math.ceil((sortedMessages[sortedMessages.length-1].timestamp - sortedMessages[0].timestamp)/1000)} seconds]`;
      combinedText += batchContext;
      
      await logDebug('BUFFER_BATCH_CONTEXT', 'Added batch context to combined message', {
        batchId,
        batchContext
      });
    }
    
    // Use the message data from the last message for API key info
    const lastMessageData = sortedMessages[sortedMessages.length - 1].messageData;
    
    // If instance base URL is missing, try to get it from the last message
    if (!instanceBaseUrl) {
      instanceBaseUrl = lastMessageData.server_url || Deno.env.get('EVOLUTION_API_URL') || 'https://api.convgo.com';
      
      await logDebug('BUFFER_URL_FALLBACK', 'Using fallback instance base URL', {
        instanceBaseUrl,
        source: lastMessageData.server_url ? 'message_data' : 
                Deno.env.get('EVOLUTION_API_URL') ? 'environment' : 'default'
      });
    }
    
    // If AI config is missing or empty, create a basic one
    if (!aiConfig || Object.keys(aiConfig).length === 0) {
      try {
        // Try to get AI config from database
        const { data: instanceData } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('ai_config')
          .eq('instance_name', instanceName)
          .maybeSingle();
          
        aiConfig = instanceData?.ai_config || {
          system_prompt: "You are a helpful assistant that responds to WhatsApp messages.",
          temperature: 0.7
        };
        
        await logDebug('BUFFER_CONFIG_FALLBACK', 'Using fallback AI configuration', {
          source: instanceData?.ai_config ? 'database' : 'default',
          hasSystemPrompt: !!aiConfig.system_prompt
        });
      } catch (error) {
        // Create a default config
        aiConfig = {
          system_prompt: "You are a helpful assistant that responds to WhatsApp messages.",
          temperature: 0.7
        };
        
        await logDebug('BUFFER_CONFIG_ERROR', 'Error fetching AI config, using default', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    try {
      // Process the combined message with the AI
      const result = await generateAndSendAIResponse(
        combinedText,
        context,
        instanceName,
        fromNumber,
        instanceBaseUrl,
        aiConfig,
        lastMessageData,
        conversationId,
        supabaseUrl,
        supabaseServiceKey,
        imageUrlToUse
      );
      
      // Log success or failure for the entire batch
      await logDebug('BUFFER_BATCH_PROCESSING_COMPLETE', 'Completed batch processing of buffered messages', {
        batchId,
        messageCount: bufferedMessages.length,
        success: result,
        messageIds: bufferedMessages.map(m => m.messageId).join(','),
        processingTimeMs: Date.now() - sortedMessages[0].timestamp
      });
      
      return result;
    } catch (error) {
      // Enhanced error handling for batch processing
      await logDebug('BUFFER_BATCH_PROCESSING_ERROR', 'Error during batch processing', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageCount: bufferedMessages.length,
        messageIds: bufferedMessages.map(m => m.messageId).join(',')
      });
      
      // Return failure to allow proper buffer state cleanup
      return false;
    }
  } catch (error) {
    // Catch-all error handler with detailed logging
    await logDebug('BUFFER_PROCESS_EXCEPTION', 'Unhandled exception processing buffered messages', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      messageCount: bufferedMessages?.length || 0,
      messageIds: bufferedMessages?.map(m => m.messageId).join(',') || 'unknown'
    });
    console.error('Error processing buffered messages:', error);
    return false;
  }
}

// Helper function to find or create a conversation
// This is imported directly in the module to prevent missing references
async function findOrCreateConversation(instanceId: string, userPhone: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials for conversation creation');
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: existingConversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, status, last_activity')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .eq('status', 'active')
      .single();

    if (!findError && existingConversation) {
      const lastActivity = new Date(existingConversation.last_activity);
      const currentTime = new Date();
      const hoursDifference = (currentTime.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursDifference > 6) {
        await supabaseAdmin
          .from('whatsapp_conversations')
          .update({ 
            status: 'expired',
            conversation_data: {
              ...existingConversation.conversation_data,
              expiration_details: {
                expired_at: currentTime.toISOString(),
                inactive_hours: hoursDifference.toFixed(2)
              }
            }
          })
          .eq('id', existingConversation.id);
          
        await logDebug('CONVERSATION_EXPIRED', `Conversation ${existingConversation.id} expired after ${hoursDifference.toFixed(2)} hours of inactivity`);
        
        const { data: anyConversation, error: anyError } = await supabaseAdmin
          .from('whatsapp_conversations')
          .select('id, status')
          .eq('instance_id', instanceId)
          .eq('user_phone', userPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (!anyError && anyConversation) {
          const { data: updatedConversation, error: updateError } = await supabaseAdmin
            .from('whatsapp_conversations')
            .update({
              status: 'active',
              last_activity: currentTime.toISOString(),
              conversation_data: { 
                context: {
                  last_update: currentTime.toISOString(),
                  reactivated: true,
                  previously_expired: true,
                  activity_timeout_hours: 6
                }
              }
            })
            .eq('id', anyConversation.id)
            .select('id')
            .single();
            
          if (updateError) throw updateError;
          
          await logDebug('CONVERSATION_REACTIVATED', `Reactivated conversation ${anyConversation.id} for instance ${instanceId} and phone ${userPhone}`);
          
          return updatedConversation.id;
        }
      } else {
        return existingConversation.id;
      }
    }

    const { data: inactiveConversation, error: inactiveError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .limit(1)
      .single();
      
    if (!inactiveError && inactiveConversation) {
      const { data: updatedConversation, error: updateError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          status: 'active',
          last_activity: new Date().toISOString(),
          conversation_data: { 
            context: {
              last_update: new Date().toISOString(),
              message_count: 0,
              created_at: new Date().toISOString(),
              activity_timeout_hours: 6
            }
          }
        })
        .eq('id', inactiveConversation.id)
        .select('id')
        .single();
        
      if (updateError) throw updateError;
      
      await logDebug('CONVERSATION_UPDATED', `Updated existing conversation ${inactiveConversation.id} to active status`);
      
      return updatedConversation.id;
    }

    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        user_phone: userPhone,
        status: 'active',
        conversation_data: { 
          context: {
            last_update: new Date().toISOString(),
            message_count: 0,
            created_at: new Date().toISOString(),
            activity_timeout_hours: 6
          }
        }
      })
      .select('id')
      .single();

    if (createError) throw createError;
    
    await logDebug('CONVERSATION_CREATED', `New conversation created for instance ${instanceId} and phone ${userPhone}`);
    
    return newConversation.id;
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    await logDebug('CONVERSATION_ERROR', `Error in findOrCreateConversation`, { error });
    throw error;
  }
}
