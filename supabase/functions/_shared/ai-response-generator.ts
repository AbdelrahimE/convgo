
import logDebug from "./webhook-logger.ts";
import { storeMessageInConversation } from "./conversation-storage.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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
        temperature: aiConfig.temperature || 0.5,
        model: 'gpt-4o-mini',
        maxContextTokens: 3000, // Explicit token limit
        imageUrl: imageUrl, // Pass the image URL if available
        userId: aiConfig.user_id || null,
        // SMART: Pass business context and personality info for smarter responses
        selectedPersonalityId: aiConfig.selectedPersonalityId || null,
        selectedPersonalityName: aiConfig.selectedPersonalityName || null,
        detectedIntent: aiConfig.detectedIntent || null,
        intentConfidence: aiConfig.intentConfidence || null,
        businessContext: aiConfig.businessContext || null,
        detectedIndustry: aiConfig.detectedIndustry || null,
        communicationStyle: aiConfig.communicationStyle || null,
        culturalContext: aiConfig.culturalContext || null
      })
    });

    if (!responseGenResponse.ok) {
      const errorText = await responseGenResponse.text();
      await logDebug('AI_RESPONSE_ERROR', 'AI response generation failed', {
        status: responseGenResponse.status,
        error: errorText
      });
      logger.error('AI response generation failed:', errorText);
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
          response_model: responseData.model || 'gpt-4o-mini',
          // NEW: Add personality system metadata
          metadata: {
            personality_id: aiConfig.selectedPersonalityId || null,
            personality_name: aiConfig.selectedPersonalityName || null,
            detected_intent: aiConfig.detectedIntent || null,
            intent_confidence: aiConfig.intentConfidence || null,
            personality_system_used: !!aiConfig.selectedPersonalityId,
            image_processed: !!imageUrl,
            timestamp: new Date().toISOString()
          }
        });

      if (interactionError) {
        await logDebug('AI_INTERACTION_SAVE_ERROR', 'Error saving AI interaction', {
          error: interactionError
        });
        logger.error('Error saving AI interaction:', interactionError);
      } else {
        await logDebug('AI_INTERACTION_SAVED', 'AI interaction saved successfully');
      }
    } catch (error) {
      await logDebug('AI_INTERACTION_SAVE_EXCEPTION', 'Exception saving AI interaction', {
        error
      });
      logger.error('Exception saving AI interaction:', error);
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
        logger.error('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
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
          logger.error('Error sending WhatsApp message:', errorText);
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
        logger.error('Exception sending WhatsApp message:', error);
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
