
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
    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Generate system prompt
    await logDebug('AI_SYSTEM_PROMPT', 'Using system prompt from configuration', { 
      userSystemPrompt: aiConfig.system_prompt
    });
    
    const systemPrompt = aiConfig.system_prompt;

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
        temperature: aiConfig.temperature || 0.7,
        model: 'gpt-4o-mini',
        maxContextTokens: 3000, // Explicit token limit
        imageUrl: imageUrl, // Pass the image URL if available
        userId: aiConfig.user_id || null
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
  context: string,
  instanceName: string,
  fromNumber: string,
  instanceBaseUrl: string,
  aiConfig: any,
  conversationId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  try {
    // If no messages in buffer, nothing to do
    if (!bufferedMessages || bufferedMessages.length === 0) {
      await logDebug('BUFFER_PROCESS_EMPTY', 'No messages in buffer to process');
      return false;
    }
    
    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Log the buffered messages processing
    await logDebug('BUFFER_PROCESSING', 'Processing buffered messages', {
      messageCount: bufferedMessages.length,
      instanceName,
      fromNumber
    });
    
    // Sort messages by timestamp to ensure correct order
    const sortedMessages = [...bufferedMessages].sort((a, b) => a.timestamp - b.timestamp);
    
    // Combine text from all messages
    let combinedText = '';
    let imageUrlToUse: string | null = null;
    
    // Save each message in the conversation history and build combined text
    for (let i = 0; i < sortedMessages.length; i++) {
      const message = sortedMessages[i];
      
      // Store each individual message in conversation history
      if (message.messageText) {
        await storeMessageInConversation(
          conversationId, 
          'user', 
          message.messageText, 
          message.messageId, 
          supabaseAdmin
        );
        
        // Add to combined text with separators between messages
        if (combinedText) {
          combinedText += '\n---\n'; // Add separator between messages
        }
        combinedText += message.messageText;
      }
      
      // Use the last image in the sequence if multiple images
      if (message.imageUrl) {
        imageUrlToUse = message.imageUrl;
      }
    }
    
    // Log the combined message
    await logDebug('BUFFER_COMBINED_MESSAGE', 'Created combined message from buffer', {
      originalCount: sortedMessages.length,
      combinedLength: combinedText.length,
      hasImage: !!imageUrlToUse,
      preview: combinedText.substring(0, 100) + (combinedText.length > 100 ? '...' : '')
    });
    
    // Use the message data from the last message for API key info
    const lastMessageData = sortedMessages[sortedMessages.length - 1].messageData;
    
    // Generate and send a SINGLE response for ALL combined messages
    // This is the key fix - we only process the combined message ONCE
    // rather than sending a response for each original message
    await logDebug('BUFFER_SENDING_SINGLE_RESPONSE', 'Sending single response for combined messages', { 
      messageCount: sortedMessages.length,
      combinedTextLength: combinedText.length
    });
    
    // Process the combined message with the AI and send only ONE response
    return await generateAndSendAIResponse(
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
    
  } catch (error) {
    await logDebug('BUFFER_PROCESS_EXCEPTION', 'Exception processing buffered messages', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('Error processing buffered messages:', error);
    return false;
  }
}
