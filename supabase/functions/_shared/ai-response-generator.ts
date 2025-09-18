
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
 * @param dataCollectionFields Optional data collection fields configuration
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
  imageUrl?: string | null,
  dataCollectionFields?: any[]
): Promise<boolean> {
  try {
    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    

    
    // Generate system prompt
    logger.info('Using system prompt from configuration', { 
      userSystemPrompt: aiConfig.system_prompt,
      hasPersonality: !!aiConfig.selectedPersonalityId,
      selectedPersonalityName: aiConfig.selectedPersonalityName || 'none',
      selectedPersonalityId: aiConfig.selectedPersonalityId || 'none'
    });
    
    const systemPrompt = aiConfig.system_prompt || 'You are a helpful AI assistant.';

    // Generate AI response with improved token management and include imageUrl
    logger.info('Generating AI response with token management', {
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
        model: 'gpt-4.1-mini',
        maxContextTokens: 12000, // زيادة من 3000 إلى 12000 للجودة العالية
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
        culturalContext: aiConfig.culturalContext || null,
        
        // Data Collection fields
        dataCollectionFields: dataCollectionFields || null
      })
    });

    if (!responseGenResponse.ok) {
      const errorText = await responseGenResponse.text();
      logger.error('AI response generation failed', {
        status: responseGenResponse.status,
        error: errorText
      });
      return false;
    }

    const responseData = await responseGenResponse.json();
    
    // Parse AI response based on data collection configuration
    let finalResponse;
    let needsDataCollection = false;
    let requestedFields = [];
    
    // 🎯 OPTIMIZED: Only attempt JSON parsing when data collection is enabled
    if (dataCollectionFields && dataCollectionFields.length > 0) {
      // Data collection is enabled → AI should return JSON format
      logger.debug('📊 Data collection enabled, attempting JSON parsing', {
        dataCollectionFieldsCount: dataCollectionFields.length
      });
      
      try {
        const parsedResponse = JSON.parse(responseData.answer);
        finalResponse = parsedResponse.response;
        needsDataCollection = parsedResponse.needsDataCollection || false;
        requestedFields = parsedResponse.requestedFields || [];
        
        logger.info('✅ AI response parsed as valid JSON', {
          hasDataCollection: needsDataCollection,
          requestedFieldsCount: requestedFields.length,
          responsePreview: finalResponse?.substring(0, 100) + '...',
          originalResponseLength: responseData.answer?.length
        });
      } catch (error) {
        logger.warn('⚠️ JSON parsing failed despite data collection being enabled', {
          error: error.message,
          originalResponsePreview: responseData.answer?.substring(0, 200) + '...',
          originalResponseLength: responseData.answer?.length
        });
        
        // Fallback: Try to extract JSON pattern from mixed response
        const jsonMatch = responseData.answer?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            logger.info('🔍 Found JSON pattern in response, attempting extraction', {
              jsonPattern: jsonMatch[0].substring(0, 100) + '...'
            });
            
            const extracted = JSON.parse(jsonMatch[0]);
            if (extracted.response) {
              finalResponse = extracted.response;
              needsDataCollection = extracted.needsDataCollection || false;
              requestedFields = extracted.requestedFields || [];
              
              logger.info('✅ Successfully extracted JSON from mixed response', {
                extractedResponse: finalResponse?.substring(0, 100) + '...',
                hasDataCollection: needsDataCollection,
                requestedFieldsCount: requestedFields.length
              });
            } else {
              logger.warn('⚠️ JSON found but missing response field, using original text', {
                extractedKeys: Object.keys(extracted)
              });
              finalResponse = responseData.answer;
            }
          } catch (extractError) {
            logger.warn('⚠️ JSON pattern found but parsing failed, using original text', {
              extractError: extractError.message,
              jsonPatternPreview: jsonMatch[0].substring(0, 100) + '...'
            });
            finalResponse = responseData.answer;
          }
        } else {
          logger.warn('⚠️ No JSON pattern found in response, using original text', {
            responsePreview: responseData.answer?.substring(0, 100) + '...'
          });
          finalResponse = responseData.answer;
        }
      }
    } else {
      // Data collection is NOT enabled → AI returns plain text (expected behavior)
      logger.debug('📄 Data collection disabled, using response as plain text', {
        responsePreview: responseData.answer?.substring(0, 100) + '...'
      });
      
      finalResponse = responseData.answer;
      needsDataCollection = false;
      requestedFields = [];
    }
    
    logger.info('AI response generated successfully', {
      responsePreview: finalResponse?.substring(0, 100) + '...',
      tokens: responseData.usage,
      fromCache: responseData.cacheInfo?.fromCache || false,
      cacheMatchType: responseData.cacheInfo?.matchType || 'none',
      needsDataCollection,
      requestedFields: requestedFields.join(', ')
    });

    // Log token usage if available
    if (responseData.tokenUsage) {
      logger.info('Token usage details', responseData.tokenUsage);
    }
    
    // Log cache information if available
    if (responseData.cacheInfo?.fromCache) {
      logger.info('[CACHE HIT] Response served from cache', {
        matchType: responseData.cacheInfo.matchType,
        confidence: responseData.cacheInfo.confidence,
        responseTime: responseData.cacheInfo.responseTime
      });
    }

    // Store AI response in conversation history
    if (finalResponse) {
      await storeMessageInConversation(conversationId, 'assistant', finalResponse, undefined, supabaseAdmin);
    }

    // Save interaction to database
    try {
      logger.info('Saving AI interaction to database');
      
      const { error: interactionError } = await supabaseAdmin
        .from('whatsapp_ai_interactions')
        .insert({
          whatsapp_instance_id: aiConfig.whatsapp_instance_id,
          user_phone: fromNumber,
          user_message: query,
          ai_response: finalResponse,
          prompt_tokens: responseData.usage?.prompt_tokens || 0,
          completion_tokens: responseData.usage?.completion_tokens || 0,
          total_tokens: responseData.usage?.total_tokens || 0,
          context_token_count: Math.ceil((context?.length || 0) / 4),
          search_result_count: context ? 1 : 0,
          response_model: responseData.model || 'gpt-4.1-mini',
          // ENHANCED: Add comprehensive analysis metadata
          metadata: {
            personality_id: aiConfig.selectedPersonalityId || null,
            personality_name: aiConfig.selectedPersonalityName || null,
            detected_intent: aiConfig.detectedIntent || null,
            intent_confidence: aiConfig.intentConfidence || null,
            response_quality: aiConfig.responseQuality || null, // NEW: Store response quality
            quality_reasoning: aiConfig.qualityReasoning || null, // NEW: Store quality reasoning
            personality_system_used: !!aiConfig.selectedPersonalityId,
            image_processed: !!imageUrl,
            timestamp: new Date().toISOString(),
            // البيانات الجديدة من التحليل المتقدم
            emotion_analysis: aiConfig.emotionAnalysis || null,
            customer_journey: aiConfig.customerJourney || null,
            product_interest: aiConfig.productInterest || null,
            business_context: aiConfig.businessContext || null,
            // معرف المحادثة للتتبع المتقدم
            conversation_id: conversationId,
            // مؤشرات الجودة المحسنة
            analysis_quality: {
              intent_confidence: aiConfig.intentConfidence || 0,
              response_quality: aiConfig.responseQuality || 0, // NEW: Add response quality score
              emotion_intensity: aiConfig.emotionAnalysis?.intensity || 0,
              stage_confidence: aiConfig.customerJourney?.stage_confidence || 0,
              conversion_probability: aiConfig.customerJourney?.conversion_probability || 0
            }
          }
        });

      if (interactionError) {
        logger.error('Error saving AI interaction', {
          error: interactionError
        });
      } else {
        logger.info('AI interaction saved successfully');
        
        // تحديث عداد استخدام الشخصية إذا تم اختيار شخصية
        if (aiConfig.selectedPersonalityId) {
          try {
            logger.info('Updating personality usage count', {
              personalityId: aiConfig.selectedPersonalityId,
              personalityName: aiConfig.selectedPersonalityName
            });
            
            const { error: usageError } = await supabaseAdmin.rpc('update_personality_usage', {
              p_personality_id: aiConfig.selectedPersonalityId
            });
            
            if (usageError) {
              logger.error('Error updating personality usage count', {
                error: usageError,
                personalityId: aiConfig.selectedPersonalityId
              });
            } else {
              logger.info('Successfully updated personality usage count', {
                personalityId: aiConfig.selectedPersonalityId,
                personalityName: aiConfig.selectedPersonalityName
              });
            }
          } catch (error) {
            logger.error('Exception updating personality usage count', {
              error,
              personalityId: aiConfig.selectedPersonalityId
            });
          }
        }
      }
    } catch (error) {
      logger.error('Exception saving AI interaction', {
        error
      });
    }

    // Send response back through WhatsApp
    if (instanceBaseUrl && fromNumber && finalResponse) {
      logger.info('Sending AI response to WhatsApp', {
        instanceName,
        toNumber: fromNumber,
        baseUrl: instanceBaseUrl
      });
      
      // Determine Evolution API key
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || messageData.apikey;
      
      if (!evolutionApiKey) {
        logger.error('EVOLUTION_API_KEY environment variable not set and no apikey in payload');
        return false;
      }

      // Construct the send message URL according to EVOLUTION API format
      const sendUrl = `${instanceBaseUrl}/message/sendText/${instanceName}`;
      logger.info('Constructed send message URL', { sendUrl });
      
      try {
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: fromNumber,
            text: finalResponse
          })
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          logger.error('Error sending WhatsApp message', {
            status: sendResponse.status,
            error: errorText,
            sendUrl,
            headers: {
              'Content-Type': 'application/json',
              'apikey': '[REDACTED]'
            },
            body: {
              number: fromNumber,
              text: finalResponse.substring(0, 50) + '...'
            }
          });
          return false;
        }

        const sendResult = await sendResponse.json();
        logger.info('WhatsApp message sent successfully', { sendResult });
        return true;
      } catch (error) {
        logger.error('Exception sending WhatsApp message', { 
          error,
          sendUrl, 
          instanceBaseUrl,
          fromNumber
        });
        return false;
      }
    } else {
      logger.warn('Missing data for sending WhatsApp message', {
        hasInstanceBaseUrl: !!instanceBaseUrl,
        hasFromNumber: !!fromNumber,
        hasResponse: !!finalResponse
      });
      return false;
    }
  } catch (error) {
    logger.error('Exception in generate and send function', { error });
    return false;
  }
}
