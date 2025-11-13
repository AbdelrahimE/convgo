import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

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
  needsHumanSupport: boolean;
  humanSupportReason: string | null;
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
  // External Action fields - only present when intent === 'external_action'
  externalAction?: {
    id: string;
    name: string;
    displayName: string;
    extractedVariables: Record<string, any>;
    webhookUrl: string;
    payloadTemplate: Record<string, any>;
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
  needsHumanSupport: boolean;
  humanSupportReason: string | null;
  reasoning: string;
  basicEmotionState: string;
}> {
  try {
    // FIX 1: التحقق من صحة المدخلات
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      logger.warn('Invalid or empty message provided');
      throw new Error('Invalid message input');
    }

    // تنظيف الرسالة مع السماح بطول أكبر للجودة العالية
    const cleanMessage = message.trim().substring(0, 2000); // زيادة من 500 إلى 2000 حرف للجودة
    const recentContext = conversationHistory && conversationHistory.length > 0 
      ? conversationHistory.slice(-5).join('\n').substring(0, 1500)  // زيادة من 3 إلى 5 رسائل ومن 300 إلى 1500 حرف
      : 'لا يوجد سياق سابق';
    
    // prompt محسن ومبسط مع اكتشاف نية التصعيد الذكي
    const optimizedPrompt = `You are a smart intent analyzer. Analyze this Arabic message and return ONLY valid JSON.

Previous context: ${recentContext}
Current message: "${cleanMessage}"

Return this exact JSON format:
{
  "intent": "sales|technical|customer-support|billing|general",
  "confidence": 0.9,
  "reasoning": "brief reason",
  "needsHumanSupport": false,
  "humanSupportReason": null,
  "basicEmotionState": "neutral|positive|negative|urgent"
}

Rules:
- sales: asking about product/price/purchase
- technical: technical issue/error
- customer-support: general inquiry/complaint
- billing: payment/invoice issue
- general: greeting/general question

HUMAN SUPPORT DETECTION (needsHumanSupport):
Set needsHumanSupport=true if user wants to:
- Talk to human/agent/representative ("أريد أكلم شخص", "محتاج حد يساعدني", "ممكن أكلم المدير")
- Complain about AI/bot ("الروبوت مش فاهم", "الذكاء مش شغال", "عاوز أكلم بني آدم")
- Express frustration with automation ("مش عارف أتعامل مع النظام", "محتاج مساعدة حقيقية")
- Request escalation indirectly ("الموضوع معقد", "محتاج حد متخصص", "مش لاقي حل")

Set humanSupportReason to: "direct_request|ai_frustration|complexity|escalation_needed"`;

    const apiKey = getNextOpenAIKey();
    
    // تسجيل تفاصيل الطلب قبل الإرسال
    const requestPayload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: optimizedPrompt },
        { role: 'user', content: cleanMessage }
      ],
      temperature: 0.1,
      max_tokens: 6000 // زيادة من 3000 إلى 6000 لتحليل أعمق وأشمل
    };
    
    logger.info('🚀 GPT-4o-mini Request Details:', {
      model: requestPayload.model,
      temperature: requestPayload.temperature,
      max_tokens: requestPayload.max_tokens,
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
    
    logger.info('⏱️ GPT-4o-mini Request Timing:', {
      request_duration_ms: requestDuration,
      model_used: 'gpt-4o-mini',
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
    
    // تسجيل تفاصيل الاستجابة من GPT-4o-mini
    logger.info('📥 GPT-4o-mini Response Details:', {
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
      logger.error('❌ Invalid GPT-4o-mini response structure:', {
        has_choices: !!responseData.choices,
        choices_length: responseData.choices?.length || 0,
        response_data_keys: Object.keys(responseData)
      });
      throw new Error('Invalid OpenAI response structure');
    }

    const rawContent = responseData.choices[0].message.content;
    if (!rawContent) {
      logger.error('❌ Empty content from GPT-4o-mini:', {
        message_object: responseData.choices[0].message,
        finish_reason: responseData.choices[0].finish_reason
      });
      throw new Error('Empty response from OpenAI');
    }
    
    const content = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '');

    logger.info('📝 GPT-4o-mini Response Content:', {
      content_length: content.length,
      content_preview: content.substring(0, 200) + '...',
      model_used: 'gpt-4o-mini',
      token_usage: responseData.usage
    });

    // معالجة أكثر أماناً للـ JSON
    let result;
    try {
      result = JSON.parse(content.trim());
      logger.info('✅ JSON parsing successful from GPT-4o-mini response');
    } catch (parseError) {
      logger.error('❌ JSON parsing failed for GPT-4o-mini response:', {
        error_message: parseError.message,
        content_sample: content.substring(0, 500),
        content_length: content.length,
        model_used: 'gpt-4o-mini'
      });
      throw new Error(`JSON parsing failed: ${parseError.message}`);
    }

    // التحقق من صحة البيانات مع إضافة اكتشاف التصعيد الذكي
    const validatedResult = {
      intent: (result.intent && ['sales', 'technical', 'customer-support', 'billing', 'general'].includes(result.intent)) 
        ? result.intent : 'general',
      confidence: Math.min(0.98, Math.max(0.3, Number(result.confidence) || 0.6)),
      reasoning: String(result.reasoning || 'تحليل محسن').substring(0, 100),
      needsHumanSupport: Boolean(result.needsHumanSupport),
      humanSupportReason: (result.humanSupportReason && ['direct_request', 'ai_frustration', 'complexity', 'escalation_needed'].includes(result.humanSupportReason))
        ? result.humanSupportReason : null,
      basicEmotionState: (result.basicEmotionState && ['neutral', 'positive', 'negative', 'urgent'].includes(result.basicEmotionState))
        ? result.basicEmotionState : 'neutral'
    };

    logger.info('✅ GPT-4o-mini Analysis Complete:', {
      intent: validatedResult.intent,
      confidence: validatedResult.confidence,
      needsHumanSupport: validatedResult.needsHumanSupport,
      humanSupportReason: validatedResult.humanSupportReason,
      emotion_state: validatedResult.basicEmotionState,
      model_used: 'gpt-4o-mini',
      total_processing_time_ms: Date.now() - requestStartTime
    });
    
    return validatedResult;

  } catch (error) {
    logger.error('❌ Error in GPT-4o-mini analysis:', {
      error_message: error.message,
      error_type: error.constructor.name,
      stack_trace: error.stack,
      model: 'gpt-4o-mini',
      timestamp: new Date().toISOString()
    });
    
    // Fallback آمن مع معلومات أكثر تفصيلاً
    return {
      intent: 'general',
      confidence: 0.5,
      needsHumanSupport: false,
      humanSupportReason: null,
      reasoning: `تحليل احتياطي - خطأ في GPT-4o-mini: ${error.message}`,
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
      p_intent_confidence: intentConfidence // Pass the actual confidence
    });

    if (error) {
      logger.error('Error getting contextual personality:', error, {
        instanceId,
        intent
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
      temperature: personalityRow.temperature || 0.7 // قيمة افتراضية متوازنة لموديل GPT-4o-mini
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
      intent
    });
    return null;
  }
}

/**
 * Check for external actions using AI-based intent detection
 * This runs BEFORE the core 5 intents to allow custom user-defined actions
 */
async function checkExternalActions(
  message: string,
  conversationHistory: string[],
  instanceId: string
): Promise<{
  matchedAction: any | null;
  confidence: number;
  extractedVariables: Record<string, any>;
  reasoning: string;
}> {
  try {
    // Get active external actions for this instance
    const { data: externalActions, error: actionsError } = await supabaseAdmin
      .from('external_actions')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (actionsError || !externalActions || externalActions.length === 0) {
      logger.debug('No external actions found for instance:', instanceId);
      return {
        matchedAction: null,
        confidence: 0,
        extractedVariables: {},
        reasoning: 'No external actions configured'
      };
    }
    
    logger.info(`🔍 Checking ${externalActions.length} external actions for instance ${instanceId}`);
    
    // Prepare training examples for OpenAI analysis
    const actionsForAnalysis = externalActions.map(action => ({
      id: action.id,
      name: action.action_name,
      display_name: action.display_name,
      training_examples: action.training_examples || [],
      confidence_threshold: action.confidence_threshold || 0.75,
      variable_prompts: action.variable_prompts || {}
    }));
    
    const recentContext = conversationHistory && conversationHistory.length > 0 
      ? conversationHistory.slice(-4).join('\n').substring(0, 800)  // زيادة من 2 إلى 4 رسائل ومن 200 إلى 800 حرف
      : 'No previous context';
    
    const cleanMessage = message.trim().substring(0, 1600);  // زيادة من 400 إلى 1600 حرف
    
    const externalActionPrompt = `You are an external action detector for a WhatsApp AI system. Analyze if this message matches any of the defined external actions.

Previous context: ${recentContext}
Current message: "${cleanMessage}"

Available External Actions:
${actionsForAnalysis.map((action, index) => `
${index + 1}. Action: "${action.display_name}" (ID: ${action.name})
   Training Examples: ${JSON.stringify(action.training_examples)}
   Confidence Threshold: ${action.confidence_threshold}
   Variable Prompts: ${JSON.stringify(action.variable_prompts)}
`).join('\n')}

Return ONLY valid JSON format:
{
  "matched_action_id": "action_name or null",
  "confidence": 0.85,
  "reasoning": "why this action matches or doesn't match",
  "extracted_variables": {
    "variable_name": "extracted_value"
  }
}

Rules:
1. Only match if confidence >= action's threshold
2. Extract variables based on variable_prompts if action matches
3. If no action matches confidently, return matched_action_id: null
4. Be strict about matching - only match if really similar to training examples`;

    const apiKey = getNextOpenAIKey();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: externalActionPrompt },
          { role: 'user', content: cleanMessage }
        ],
        temperature: 0.1,
        max_tokens: 3000
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`OpenAI API error for external actions: ${response.status}:`, errorData);
      return {
        matchedAction: null,
        confidence: 0,
        extractedVariables: {},
        reasoning: `OpenAI error: ${response.status}`
      };
    }
    
    const responseData = await response.json();
    const rawContent = responseData.choices[0]?.message?.content;
    
    if (!rawContent) {
      logger.error('Empty response from OpenAI for external actions');
      return {
        matchedAction: null,
        confidence: 0,
        extractedVariables: {},
        reasoning: 'Empty OpenAI response'
      };
    }
    
    const content = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '');
    
    let result;
    try {
      result = JSON.parse(content.trim());
    } catch (parseError) {
      logger.error('JSON parsing failed for external actions:', parseError.message);
      return {
        matchedAction: null,
        confidence: 0,
        extractedVariables: {},
        reasoning: 'JSON parsing failed'
      };
    }
    
    if (result.matched_action_id && result.confidence) {
      // Find the matched action
      const matchedAction = externalActions.find(action => action.action_name === result.matched_action_id);
      
      if (matchedAction && result.confidence >= matchedAction.confidence_threshold) {
        logger.info('✅ External action matched:', {
          actionName: matchedAction.action_name,
          confidence: result.confidence,
          threshold: matchedAction.confidence_threshold,
          extractedVariables: result.extracted_variables || {}
        });
        
        return {
          matchedAction,
          confidence: result.confidence,
          extractedVariables: result.extracted_variables || {},
          reasoning: result.reasoning || 'External action matched'
        };
      }
    }
    
    logger.debug('No external actions matched with sufficient confidence');
    return {
      matchedAction: null,
      confidence: result.confidence || 0,
      extractedVariables: {},
      reasoning: result.reasoning || 'No confident match'
    };
    
  } catch (error) {
    logger.error('❌ Error in checkExternalActions:', error);
    return {
      matchedAction: null,
      confidence: 0,
      extractedVariables: {},
      reasoning: `Error: ${error.message}`
    };
  }
}

/**
 * النظام الذكي المحسن للـ MVP - سرعة وبساطة
 * تحسين جذري: من 5 استدعاءات OpenAI إلى 1 فقط!
 * توفير متوقع: 60-70% من زمن الاستجابة
 * 
 * ENHANCED: Now checks external actions FIRST before core intents
 */
async function smartIntentAnalysisOptimized(
  message: string,
  conversationHistory: string[],
  instanceId: string
): Promise<{
  intent: string;
  confidence: number;
  needsHumanSupport: boolean;
  humanSupportReason: string | null;
  reasoning: string;
  selectedPersonality: any;
  emotionAnalysis: any;
  customerJourney: any;
  productInterest: any;
  externalAction?: any;
}> {
  
  // 1. FIRST: Check for external actions (user-defined custom intents)
  logger.info('🔍 Phase 1: Checking external actions first');
  const externalActionResult = await checkExternalActions(message, conversationHistory, instanceId);
  
  if (externalActionResult.matchedAction) {
    logger.info('🎯 External action matched - bypassing core intent analysis:', {
      actionName: externalActionResult.matchedAction.action_name,
      confidence: externalActionResult.confidence,
      extractedVariables: externalActionResult.extractedVariables
    });
    
    // Return special response indicating external action was triggered
    return {
      intent: 'external_action',
      confidence: externalActionResult.confidence,
      needsHumanSupport: false,
      humanSupportReason: null,
      reasoning: `External Action: ${externalActionResult.matchedAction.display_name} - ${externalActionResult.reasoning}`,
      selectedPersonality: null, // External actions don't use personalities
      emotionAnalysis: {
        primary_emotion: 'neutral',
        intensity: 0.5,
        emotional_indicators: [],
        sentiment_score: 0,
        emotional_state: 'neutral',
        urgency_detected: false
      },
      customerJourney: {
        current_stage: 'action_triggered',
        stage_confidence: 0.9,
        progression_indicators: ['external_action_match'],
        next_expected_action: 'Execute webhook',
        conversion_probability: 0
      },
      productInterest: {
        requested_item: null,
        category: null,
        specifications: [],
        price_range_discussed: false,
        urgency_level: 'low',
        decision_factors: []
      },
      // Special fields for external action
      externalAction: {
        id: externalActionResult.matchedAction.id,
        name: externalActionResult.matchedAction.action_name,
        displayName: externalActionResult.matchedAction.display_name,
        extractedVariables: externalActionResult.extractedVariables,
        webhookUrl: externalActionResult.matchedAction.webhook_url,
        payloadTemplate: externalActionResult.matchedAction.payload_template,
        responseType: externalActionResult.matchedAction.response_type || 'simple_confirmation',
        confirmationMessage: externalActionResult.matchedAction.confirmation_message || 'تم تنفيذ طلبك بنجاح ✅',
        responseTimeoutSeconds: externalActionResult.matchedAction.response_timeout_seconds || 30
      }
    };
  }
  
  logger.info('⏭️ No external actions matched - proceeding with core intent analysis');
  
  // 2. التحليل الأساسي المحسن الجديد (استدعاء OpenAI واحد فقط)
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
    category: null,
    specifications: [],
    price_range_discussed: message.includes('سعر') || message.includes('تكلفة') || message.includes('ثمن'),
    urgency_level: coreAnalysis.basicEmotionState === 'urgent' ? 'high' : 'medium',
    decision_factors: []
  };
  
  // 3. الحصول على الشخصية المناسبة (محسن للسرعة) مع تمرير الثقة الفعلية
  const selectedPersonality = await getSmartPersonality(instanceId, coreAnalysis.intent, coreAnalysis.confidence);
  
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
    needsHumanSupport: coreAnalysis.needsHumanSupport,
    humanSupportReason: coreAnalysis.humanSupportReason,
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
      needsHumanSupport: analysisResult.needsHumanSupport,
      humanSupportReason: analysisResult.humanSupportReason,
      reasoning: analysisResult.reasoning,
      selectedPersonality: analysisResult.selectedPersonality,
      processingTimeMs,
      cacheHit: false,
      emotionAnalysis: analysisResult.emotionAnalysis,
      customerJourney: analysisResult.customerJourney,
      productInterest: analysisResult.productInterest,
      // ✅ إضافة الـ externalAction المفقود
      externalAction: analysisResult.externalAction
    };

    logger.info('🏁 Smart Intent Analysis Completed Successfully:', {
      intent: result.intent,
      confidence: result.confidence,
      needsHumanSupport: result.needsHumanSupport,
      humanSupportReason: result.humanSupportReason,
      emotion_state: result.emotionAnalysis?.emotional_state,
      customer_stage: result.customerJourney?.current_stage,
      selected_personality: result.selectedPersonality?.name || 'none',
      personality_id: result.selectedPersonality?.id || 'none',
      processing_time_ms: processingTimeMs,
      gpt4o_mini_model: 'gpt-4o-mini',
      cache_will_be_saved: true,
      timestamp: new Date().toISOString(),
      // ✅ إضافة logging لـ externalAction
      has_external_action: !!result.externalAction,
      external_action_id: result.externalAction?.id || 'none',
      external_action_name: result.externalAction?.name || 'none'
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
      gpt4o_mini_model: 'gpt-4o-mini',
      timestamp: new Date().toISOString(),
      cache_size: intentCache.size
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTimeMs,
        model_info: {
          model: 'gpt-4o-mini'
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