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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: optimizedPrompt },
          { role: 'user', content: cleanMessage }
        ],
        temperature: 1,
        max_completion_tokens: 300, // المعيار الجديد لـ GPT-5
        reasoning_effort: 'low' // أسرع إعداد للـ MVP
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`OpenAI API error ${response.status}:`, errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const responseData = await response.json();
    
    // التحقق من صحة الاستجابة
    if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
      throw new Error('Invalid OpenAI response structure');
    }

    const content = responseData.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    logger.log(`OpenAI response: ${content.substring(0, 100)}...`);

    // معالجة أكثر أماناً للـ JSON
    let result;
    try {
      result = JSON.parse(content.trim());
    } catch (parseError) {
      logger.error('JSON parsing failed, content:', content);
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

    logger.log(`Intent analysis success: ${validatedResult.intent} (${validatedResult.confidence})`);
    return validatedResult;

  } catch (error) {
    logger.error('Error in optimized core intent analysis:', error);
    
    // Fallback آمن مع معلومات أكثر تفصيلاً
    return {
      intent: 'general',
      confidence: 0.5,
      reasoning: `تحليل احتياطي - خطأ: ${error.message}`,
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
 * الحصول على الشخصية المناسبة بذكاء - نسخة محسنة
 */
async function getSmartPersonality(
  instanceId: string,
  intent: string,
  businessContext: any
): Promise<any> {
  try {
    logger.debug(`Getting personality for intent: ${intent}, instance: ${instanceId}`);

    const { data, error } = await supabaseAdmin.rpc('get_contextual_personality', {
      p_whatsapp_instance_id: instanceId,
      p_intent: intent,
      p_business_context: businessContext
    });

    if (error) {
      logger.error('Error getting contextual personality:', error);
      
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin.rpc('get_personality_for_intent', {
        p_whatsapp_instance_id: instanceId,
        p_intent_category: intent
      });

      if (fallbackError || !fallbackData) {
        logger.warn('Fallback personality search failed, using general personality');
        
        const { data: generalData, error: generalError } = await supabaseAdmin
          .from('ai_personalities')
          .select('*')
          .eq('whatsapp_instance_id', instanceId)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (generalError || !generalData) {
          logger.error('No personality found at all');
          return null;
        }
        
        return generalData;
      }
      
      return fallbackData;
    }

    if (!data) {
      logger.warn(`No contextual personality found for intent: ${intent}`);
      return null;
    }

    logger.log(`Found contextual personality: ${data.name} for intent: ${intent}`);
    return data;
  } catch (error) {
    logger.error('Exception in getSmartPersonality:', error);
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
  
  // 3. الحصول على الشخصية المناسبة (محسن للسرعة)
  const selectedPersonality = await getSmartPersonality(instanceId, coreAnalysis.intent, coreAnalysis.businessContext);
  
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

    logger.log(`Smart intent analysis (MVP optimized) for: "${message.substring(0, 50)}..."`);

    // فحص الـ Cache أولاً للاستفسارات المتكررة
    const cachedResult = getCachedIntent(message, whatsappInstanceId);
    if (cachedResult) {
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

    logger.log(`Smart intent analysis completed:`, {
      intent: result.intent,
      confidence: result.confidence,
      industry: result.businessContext.industry,
      processingTime: processingTimeMs
    });

    // حفظ النتيجة في الـ Cache للاستفسارات المستقبلية المشابهة
    setCachedIntent(message, whatsappInstanceId, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Error in smart intent analysis:', error);
    
    const processingTimeMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTimeMs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});