import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

/**
 * GPT-5-nano Model Configuration:
 * 
 * reasoning_effort values (from lowest to highest token consumption):
 * - 'low': أقل استهلاك للتوكنز - أسرع استجابة (الحالي)
 * - 'low': استهلاك منخفض للتوكنز - سرعة جيدة
 * - 'medium': استهلاك متوسط للتوكنز - توازن بين السرعة والجودة
 * - 'high': استهلاك عالي للتوكنز - أفضل جودة
 * 
 * Note: كل مستوى أعلى يستهلك توكنز أكثر ويستغرق وقتاً أطول
 */

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Cache بسيط في الذاكرة للـ MVP - توفير للاستفسارات المتكررة
const intentCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 300000; // 5 دقائق

function getCachedIntent(message: string, instanceId: string): any | null {
  const cacheKey = `${instanceId}:${message.toLowerCase().trim()}`;
  const cached = intentCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.log(`Cache hit for message: "${message.substring(0, 30)}..."`);
    return cached.result;
  }
  
  return null;
}

function setCachedIntent(message: string, instanceId: string, result: any): void {
  const cacheKey = `${instanceId}:${message.toLowerCase().trim()}`;
  intentCache.set(cacheKey, {
    result: { ...result, cacheHit: true },
    timestamp: Date.now()
  });
  
  // تنظيف Cache إذا أصبح كبيراً (حد أقصى 100 عنصر)
  if (intentCache.size > 100) {
    const oldestKey = intentCache.keys().next().value;
    intentCache.delete(oldestKey);
  }
}

interface SmartIntentRequest {
  message: string;
  whatsappInstanceId: string;
  conversationHistory?: string[];
}

interface SmartIntentResult {
  success: boolean;
  intent: string;
  confidence: number;
  businessContext: {
    industry: string;
    communicationStyle: string;
    detectedTerms: string[];
    confidence: number;
  };
  reasoning: string;
  selectedPersonality: {
    id: string;
    name: string;
    systemPrompt: string;
    industry: string;
    intent: string;
  } | null;
  processingTimeMs: number;
  cacheHit: boolean;
  // البيانات المبسطة للـ MVP
  emotionAnalysis?: {
    primary_emotion: string;
    intensity: number;
    emotional_indicators: string[];
    sentiment_score: number;
    emotional_state: string;
    urgency_detected: boolean;
  };
  customerJourney?: {
    current_stage: string;
    stage_confidence: number;
    progression_indicators: string[];
    next_expected_action: string;
    conversion_probability: number;
  };
  productInterest?: {
    requested_item: string | null;
    category: string | null;
    specifications: string[];
    price_range_discussed: boolean;
    urgency_level: string;
    decision_factors: string[];
  };
  error?: string;
}

/**
 * تحليل أساسي محسن للـ MVP - دمج ذكي لتوفير الوقت والأداء
 * يدمج 3 وظائف رئيسية في استدعاء OpenAI واحد
 * توفير متوقع: 3-4 ثواني من زمن الاستجابة
 */
async function analyzeCoreIntentOptimized(
  message: string,
  conversationHistory: string[]
): Promise<{
  intent: string;
  confidence: number;
  reasoning: string;
  businessContext: {
    industry: string;
    communicationStyle: string;
    detectedTerms: string[];
    confidence: number;
  };
  basicEmotionState: string;
}> {
  try {
    // FIX 1: التحقق من صحة المدخلات
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      logger.warn('Invalid or empty message provided');
      throw new Error('Invalid message input');
    }

    // تنظيف الرسالة وتقليل السياق للتسريع
    const cleanMessage = message.trim().substring(0, 500); // حد أقصى 500 حرف
    const recentContext = conversationHistory && conversationHistory.length > 0 
      ? conversationHistory.slice(-3).join('\n').substring(0, 300) 
      : 'لا يوجد سياق سابق';
    
    // prompt محسن ومبسط لتجنب أخطاء API
    const optimizedPrompt = `You are a smart intent analyzer. Analyze this Arabic message and return ONLY valid JSON.

Previous context: ${recentContext}
Current message: "${cleanMessage}"

Return this exact JSON format:
{
  "intent": "sales|technical|customer-support|billing|general",
  "confidence": 0.9,
  "reasoning": "brief reason",
  "businessContext": {
    "industry": "sector",
    "communicationStyle": "style",
    "detectedTerms": ["term1", "term2"],
    "confidence": 0.8
  },
  "basicEmotionState": "neutral|positive|negative|urgent"
}

Rules:
- sales: asking about product/price/purchase
- technical: technical issue/error
- customer-support: general inquiry/complaint
- billing: payment/invoice issue
- general: greeting/general question`;

    const apiKey = getNextOpenAIKey();
    
    // تسجيل تفاصيل الطلب قبل الإرسال
    const requestPayload = {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: optimizedPrompt },
        { role: 'user', content: cleanMessage }
      ],
      temperature: 1,
      max_completion_tokens: 3000, // المعيار الجديد لـ GPT-5
      reasoning_effort: 'low' // أسرع إعداد للـ MVP
    };
    
    logger.info('🚀 GPT-5-nano Request Details:', {
      model: requestPayload.model,
      reasoning_effort: requestPayload.reasoning_effort,
      temperature: requestPayload.temperature,
      max_completion_tokens: requestPayload.max_completion_tokens,
      system_prompt_length: optimizedPrompt.length,
      user_message_length: cleanMessage.length,
      context_length: recentContext.length,
      timestamp: new Date().toISOString(),
      api_key_prefix: apiKey.substring(0, 8) + '...'
    });
    
    const requestStartTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    
    const requestDuration = Date.now() - requestStartTime;
    
    logger.info('⏱️ GPT-5-nano Request Timing:', {
      request_duration_ms: requestDuration,
      reasoning_effort: 'low',
      response_status: response.status,
      response_ok: response.ok,
      response_headers: {
        content_type: response.headers.get('content-type'),
        content_length: response.headers.get('content-length')
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`OpenAI API error ${response.status}:`, errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const responseData = await response.json();
    
    // تسجيل تفاصيل الاستجابة من GPT-5-nano
    logger.info('📥 GPT-5-nano Response Details:', {
      model_used: responseData.model || 'unknown',
      choices_count: responseData.choices?.length || 0,
      usage: responseData.usage || null,
      finish_reason: responseData.choices?.[0]?.finish_reason || 'unknown',
      response_id: responseData.id || 'unknown',
      created: responseData.created || null,
      object: responseData.object || 'unknown'
    });
    
    // التحقق من صحة الاستجابة
    if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
      logger.error('❌ Invalid GPT-5-nano response structure:', {
        has_choices: !!responseData.choices,
        choices_length: responseData.choices?.length || 0,
        response_data_keys: Object.keys(responseData)
      });
      throw new Error('Invalid OpenAI response structure');
    }

    const content = responseData.choices[0].message.content;
    if (!content) {
      logger.error('❌ Empty content from GPT-5-nano:', {
        message_object: responseData.choices[0].message,
        finish_reason: responseData.choices[0].finish_reason
      });
      throw new Error('Empty response from OpenAI');
    }

    logger.info('📝 GPT-5-nano Response Content:', {
      content_length: content.length,
      content_preview: content.substring(0, 200) + '...',
      reasoning_effort_used: 'low',
      token_usage: responseData.usage
    });

    // معالجة أكثر أماناً للـ JSON
    let result;
    try {
      result = JSON.parse(content.trim());
      logger.info('✅ JSON parsing successful from GPT-5-nano response');
    } catch (parseError) {
      logger.error('❌ JSON parsing failed for GPT-5-nano response:', {
        error_message: parseError.message,
        content_sample: content.substring(0, 500),
        content_length: content.length,
        reasoning_effort: 'low'
      });
      throw new Error(`JSON parsing failed: ${parseError.message}`);
    }

    // التحقق من صحة البيانات
    const validatedResult = {
      intent: (result.intent && ['sales', 'technical', 'customer-support', 'billing', 'general'].includes(result.intent)) 
        ? result.intent : 'general',
      confidence: Math.min(0.98, Math.max(0.3, Number(result.confidence) || 0.6)),
      reasoning: String(result.reasoning || 'تحليل محسن').substring(0, 100),
      businessContext: {
        industry: String(result.businessContext?.industry || 'عام').substring(0, 50),
        communicationStyle: String(result.businessContext?.communicationStyle || 'ودي').substring(0, 50),
        detectedTerms: Array.isArray(result.businessContext?.detectedTerms) 
          ? result.businessContext.detectedTerms.slice(0, 5).map(term => String(term).substring(0, 30))
          : [],
        confidence: Math.min(0.98, Math.max(0.3, Number(result.businessContext?.confidence) || 0.5))
      },
      basicEmotionState: (result.basicEmotionState && ['neutral', 'positive', 'negative', 'urgent'].includes(result.basicEmotionState))
        ? result.basicEmotionState : 'neutral'
    };

    logger.info('✅ GPT-5-nano Analysis Complete:', {
      intent: validatedResult.intent,
      confidence: validatedResult.confidence,
      emotion_state: validatedResult.basicEmotionState,
      industry: validatedResult.businessContext.industry,
      detected_terms_count: validatedResult.businessContext.detectedTerms.length,
      reasoning_effort_used: 'low',
      total_processing_time_ms: Date.now() - requestStartTime
    });
    
    return validatedResult;

  } catch (error) {
    logger.error('❌ Error in GPT-5-nano analysis:', {
      error_message: error.message,
      error_type: error.constructor.name,
      stack_trace: error.stack,
      reasoning_effort: 'low',
      model: 'gpt-5-nano',
      timestamp: new Date().toISOString()
    });
    
    // Fallback آمن مع معلومات أكثر تفصيلاً
    return {
      intent: 'general',
      confidence: 0.5,
      reasoning: `تحليل احتياطي - خطأ في GPT-5-nano: ${error.message}`,
      businessContext: {
        industry: 'عام',
        communicationStyle: 'ودي',
        detectedTerms: [],
        confidence: 0.3
      },
      basicEmotionState: 'neutral'
    };
  }
}

/**
 * الحصول على الشخصية المناسبة بذكاء - نسخة محسنة مع threshold ثابت للـ MVP
 */
async function getSmartPersonality(
  instanceId: string,
  intent: string,
  businessContext: any,
  intentConfidence: number = 0.5  // Add confidence parameter
): Promise<any> {
  // Fixed optimized threshold for MVP - no user control needed
  const OPTIMIZED_CONFIDENCE_THRESHOLD = 0.7;
  try {
    logger.debug(`Getting personality for intent: ${intent}, instance: ${instanceId}`);

    logger.info(`Using intent confidence: ${intentConfidence} with threshold: ${OPTIMIZED_CONFIDENCE_THRESHOLD}`);
    
    const { data, error } = await supabaseAdmin.rpc('get_contextual_personality', {
      p_whatsapp_instance_id: instanceId,
      p_intent: intent,
      p_intent_confidence: intentConfidence, // Pass the actual confidence
      p_business_context: businessContext
    });

    if (error) {
      logger.error('Error getting contextual personality:', error, {
        instanceId,
        intent,
        businessContext: JSON.stringify(businessContext)
      });
      
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin.rpc('get_personality_for_intent', {
        p_whatsapp_instance_id: instanceId,
        p_intent_category: intent
      });

      if (fallbackError || !fallbackData || !Array.isArray(fallbackData) || fallbackData.length === 0) {
        logger.warn('Fallback personality search failed, using general personality', {
          fallbackError,
          fallbackDataType: typeof fallbackData,
          fallbackDataLength: Array.isArray(fallbackData) ? fallbackData.length : 'not array'
        });
        
        const { data: generalData, error: generalError } = await supabaseAdmin
          .from('ai_personalities')
          .select('*')
          .eq('whatsapp_instance_id', instanceId)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (generalError || !generalData) {
          logger.error('❌ No personality found at all for instance:', {
            instanceId,
            generalError: generalError?.message || generalError,
            intent
          });
          return null;
        }
        
        logger.info('✅ Using general personality as last resort:', {
          personalityId: generalData.id,
          personalityName: generalData.name
        });
        
        // تحويل أسماء الحقول لتتوافق مع ما يتوقعه الكود
        return {
          id: generalData.id,
          name: generalData.name,
          system_prompt: generalData.system_prompt,
          temperature: generalData.temperature
        };
      }
      
      // FIX: معالجة fallback data كـ array أيضاً
      const fallbackRow = fallbackData[0];
      logger.info('✅ Using fallback personality:', {
        personalityId: fallbackRow.personality_id,
        personalityName: fallbackRow.personality_name
      });
      
      // تحويل أسماء الحقول لتتوافق مع ما يتوقعه الكود
      return {
        id: fallbackRow.personality_id,
        name: fallbackRow.personality_name,
        system_prompt: fallbackRow.system_prompt,
        temperature: fallbackRow.temperature
      };
    }

    // FIX: معالجة النتيجة كـ array لأن RPC function ترجع RETURNS TABLE
    logger.debug('RPC result received:', {
      dataType: typeof data,
      isArray: Array.isArray(data),
      dataLength: Array.isArray(data) ? data.length : 'not array',
      dataContent: data
    });

    if (!data || !Array.isArray(data) || data.length === 0) {
      logger.warn(`No contextual personality found for intent: ${intent}`, {
        instanceId,
        dataReceived: data,
        isArray: Array.isArray(data)
      });
      return null;
    }

    // استخراج أول صف من النتيجة (RETURNS TABLE يرجع array)
    const personalityRow = data[0];
    logger.debug('Extracted personality row:', personalityRow);

    // التحقق من صحة البيانات المطلوبة
    if (!personalityRow.personality_id || !personalityRow.personality_name || !personalityRow.system_prompt) {
      logger.error('❌ Invalid personality data structure:', {
        hasId: !!personalityRow.personality_id,
        hasName: !!personalityRow.personality_name,
        hasPrompt: !!personalityRow.system_prompt,
        rowData: personalityRow
      });
      return null;
    }

    // تحويل أسماء الحقول لتتوافق مع ما يتوقعه الكود
    const normalizedPersonality = {
      id: personalityRow.personality_id,
      name: personalityRow.personality_name,
      system_prompt: personalityRow.system_prompt,
      temperature: personalityRow.temperature || 0.7 // قيمة افتراضية
    };

    logger.log(`✅ Found contextual personality: ${normalizedPersonality.name} for intent: ${intent}`, {
      personalityId: normalizedPersonality.id,
      systemPromptLength: normalizedPersonality.system_prompt?.length || 0,
      temperature: normalizedPersonality.temperature
    });
    return normalizedPersonality;
  } catch (error) {
    logger.error('❌ Exception in getSmartPersonality:', {
      error: error.message || error,
      stack: error.stack,
      instanceId,
      intent,
      businessContext: JSON.stringify(businessContext)
    });
    return null;
  }
}

/**
 * النظام الذكي المحسن للـ MVP - سرعة وبساطة
 * تحسين جذري: من 5 استدعاءات OpenAI إلى 1 فقط!
 * توفير متوقع: 60-70% من زمن الاستجابة
 */
async function smartIntentAnalysisOptimized(
  message: string,
  conversationHistory: string[],
  instanceId: string
): Promise<{
  intent: string;
  confidence: number;
  businessContext: any;
  reasoning: string;
  selectedPersonality: any;
  emotionAnalysis: any;
  customerJourney: any;
  productInterest: any;
}> {
  
  // 1. التحليل الأساسي المحسن الجديد (استدعاء OpenAI واحد فقط)
  const coreAnalysis = await analyzeCoreIntentOptimized(message, conversationHistory);
  
  // 2. بيانات مبسطة للـ MVP - كافية للوظائف الأساسية
  const emotionAnalysis = {
    primary_emotion: coreAnalysis.basicEmotionState === 'positive' ? 'satisfied' : 
                     coreAnalysis.basicEmotionState === 'negative' ? 'concerned' :
                     coreAnalysis.basicEmotionState === 'urgent' ? 'urgent' : 'neutral',
    intensity: 0.5,
    emotional_indicators: [],
    sentiment_score: coreAnalysis.basicEmotionState === 'positive' ? 0.7 : 
                     coreAnalysis.basicEmotionState === 'negative' ? -0.3 : 0,
    emotional_state: coreAnalysis.basicEmotionState,
    urgency_detected: coreAnalysis.basicEmotionState === 'urgent'
  };
  
  const customerJourney = {
    current_stage: coreAnalysis.intent === 'sales' ? 'consideration' : 'awareness',
    stage_confidence: 0.6,
    progression_indicators: [],
    next_expected_action: 'الرد على الاستفسار',
    conversion_probability: coreAnalysis.intent === 'sales' ? 0.7 : 0.3
  };
  
  const productInterest = {
    requested_item: coreAnalysis.intent === 'sales' ? 'منتج محتمل' : null,
    category: coreAnalysis.businessContext.industry || null,
    specifications: coreAnalysis.businessContext.detectedTerms || [],
    price_range_discussed: message.includes('سعر') || message.includes('تكلفة') || message.includes('ثمن'),
    urgency_level: coreAnalysis.basicEmotionState === 'urgent' ? 'high' : 'medium',
    decision_factors: []
  };
  
  // 3. الحصول على الشخصية المناسبة (محسن للسرعة) مع تمرير الثقة الفعلية
  const selectedPersonality = await getSmartPersonality(instanceId, coreAnalysis.intent, coreAnalysis.businessContext, coreAnalysis.confidence);
  
  // إضافة logging للتأكد من البيانات
  logger.info('Personality selection completed', {
    intent: coreAnalysis.intent,
    hasPersonality: !!selectedPersonality,
    selectedPersonalityName: selectedPersonality?.name || 'none',
    selectedPersonalityId: selectedPersonality?.id || 'none',
    systemPrompt: selectedPersonality?.system_prompt ? selectedPersonality.system_prompt.substring(0, 100) + '...' : 'none'
  });
  
  return {
    intent: coreAnalysis.intent,
    confidence: coreAnalysis.confidence,
    businessContext: coreAnalysis.businessContext,
    reasoning: `${coreAnalysis.reasoning} - معالجة محسنة للـ MVP`,
    selectedPersonality,
    emotionAnalysis,
    customerJourney,
    productInterest
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { message, whatsappInstanceId, conversationHistory = [] } = await req.json() as SmartIntentRequest;

    if (!message || !whatsappInstanceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Message and whatsappInstanceId are required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    logger.info('🎯 Smart Intent Analysis Started:', {
      message_preview: message.substring(0, 50) + '...',
      message_length: message.length,
      instance_id: whatsappInstanceId,
      has_conversation_history: conversationHistory.length > 0,
      history_items_count: conversationHistory.length,
      request_timestamp: new Date().toISOString(),
      cache_size: intentCache.size
    });

    // فحص الـ Cache أولاً للاستفسارات المتكررة
    const cachedResult = getCachedIntent(message, whatsappInstanceId);
    if (cachedResult) {
      logger.info('⚡ Cache Hit - Returning cached result:', {
        cached_intent: cachedResult.intent,
        cached_confidence: cachedResult.confidence,
        cache_age_ms: Date.now() - (intentCache.get(`${whatsappInstanceId}:${message.toLowerCase().trim()}`)?.timestamp || 0),
        processing_time_ms: Date.now() - startTime
      });
      
      return new Response(
        JSON.stringify({
          ...cachedResult,
          processingTimeMs: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحليل الذكي المحسن للـ MVP
    const analysisResult = await smartIntentAnalysisOptimized(
      message,
      conversationHistory,
      whatsappInstanceId
    );

    const processingTimeMs = Date.now() - startTime;

    const result: SmartIntentResult = {
      success: true,
      intent: analysisResult.intent,
      confidence: analysisResult.confidence,
      businessContext: analysisResult.businessContext,
      reasoning: analysisResult.reasoning,
      selectedPersonality: analysisResult.selectedPersonality,
      processingTimeMs,
      cacheHit: false,
      emotionAnalysis: analysisResult.emotionAnalysis,
      customerJourney: analysisResult.customerJourney,
      productInterest: analysisResult.productInterest
    };

    logger.info('🏁 Smart Intent Analysis Completed Successfully:', {
      intent: result.intent,
      confidence: result.confidence,
      industry: result.businessContext.industry,
      emotion_state: result.emotionAnalysis?.emotional_state,
      customer_stage: result.customerJourney?.current_stage,
      selected_personality: result.selectedPersonality?.name || 'none',
      personality_id: result.selectedPersonality?.id || 'none',
      detected_terms_count: result.businessContext.detectedTerms?.length || 0,
      processing_time_ms: processingTimeMs,
      gpt5_nano_reasoning_effort: 'low',
      cache_will_be_saved: true,
      timestamp: new Date().toISOString()
    });

    // حفظ النتيجة في الـ Cache للاستفسارات المستقبلية المشابهة
    setCachedIntent(message, whatsappInstanceId, result);
    
    logger.info('💾 Result cached for future requests:', {
      cache_key_preview: `${whatsappInstanceId}:${message.substring(0, 20)}...`,
      cache_size_after: intentCache.size,
      cache_ttl_minutes: CACHE_TTL / 60000
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    
    logger.error('❌ Critical Error in Smart Intent Analysis:', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
      error_type: error instanceof Error ? error.constructor.name : typeof error,
      error_stack: error instanceof Error ? error.stack : 'No stack trace',
      processing_time_ms: processingTimeMs,
      gpt5_nano_model: 'gpt-5-nano',
      reasoning_effort: 'low',
      timestamp: new Date().toISOString(),
      cache_size: intentCache.size
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTimeMs,
        model_info: {
          model: 'gpt-5-nano',
          reasoning_effort: 'low'
        },
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});