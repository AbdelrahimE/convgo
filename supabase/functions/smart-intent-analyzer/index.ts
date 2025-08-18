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

interface SmartIntentRequest {
  message: string;
  whatsappInstanceId: string;
  userId: string;
  conversationHistory?: string[];
  useCache?: boolean;
}

interface SmartIntentResult {
  success: boolean;
  intent: string;
  confidence: number;
  businessContext: {
    industry: string;
    communicationStyle: string;
    detectedTerms: string[];
  };
  // FIX: دعم الحقلين للتوافق مع النظام القديم والجديد
  selectedPersonality?: {
    id: string;
    name: string;
    system_prompt: string;
    temperature: number;
  };
  selected_personality?: {
    id: string;
    name: string;
    system_prompt: string;
    temperature: number;
  };
  reasoning: string;
  processingTimeMs: number;
  cacheHit: boolean;
  // البيانات الجديدة المضافة
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
 * الوظيفة الأساسية: تحليل السياق التجاري من المحادثة
 * تفهم طبيعة العمل والمجال من المحادثة بدلاً من الكلمات المحددة مسبقاً
 */
async function analyzeBusinessContext(conversationHistory: string[]): Promise<{
  industry: string;
  communicationStyle: string;
  detectedTerms: string[];
  confidence: number;
}> {
  try {
    const recentMessages = conversationHistory.slice(-10).join('\n');
    
    const contextPrompt = `أنت محلل ذكي لسياق الأعمال. حلل هذه المحادثة وحدد:

المحادثة:
${recentMessages}

حدد بدقة:
1. نوع العمل/الصناعة (تقنية، طبية، تجارة، تعليم، خدمات، صناعة، إلخ)
2. أسلوب التواصل (رسمي، ودي، تقني، بسيط)
3. المصطلحات المهمة المستخدمة (5-10 مصطلحات)
4. مستوى الثقة في التحليل (0-1)

اجب في JSON:
{
  "industry": "اسم الصناعة",
  "communicationStyle": "نوع الأسلوب", 
  "detectedTerms": ["مصطلح1", "مصطلح2", "..."],
  "confidence": 0.85
}`;

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
          { role: 'system', content: contextPrompt },
          { role: 'user', content: `حلل: "${recentMessages}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      industry: result.industry || 'عام',
      communicationStyle: result.communicationStyle || 'ودي',
      detectedTerms: result.detectedTerms || [],
      confidence: result.confidence || 0.5
    };
  } catch (error) {
    logger.error('Error analyzing business context:', error);
    return {
      industry: 'عام',
      communicationStyle: 'ودي',
      detectedTerms: [],
      confidence: 0.3
    };
  }
}

/**
 * الوظيفة الذكية: فهم النية من المعنى والسياق
 * تحليل ذكي يفهم ما يريده العميل بدلاً من البحث عن كلمات محددة
 */
async function understandIntentFromMeaning(
  message: string,
  businessContext: any
): Promise<{
  intent: string;
  confidence: number;
  reasoning: string;
}> {
  try {
    const intelligentPrompt = `أنت نظام ذكي لفهم نوايا العملاء في بيئة ${businessContext.industry}.

السياق التجاري:
- المجال: ${businessContext.industry}
- أسلوب التواصل: ${businessContext.communicationStyle}
- المصطلحات المهمة: ${businessContext.detectedTerms.join(', ')}

الرسالة: "${message}"

حدد النية الحقيقية من هذه الخيارات:
- sales: يريد شراء أو معلومات عن منتج/خدمة
- technical: لديه مشكلة تقنية أو يحتاج دعم تقني
- customer-support: يحتاج مساعدة عامة أو لديه استفسار
- billing: مشكلة في الفواتير أو الدفع
- general: تحية أو سؤال عام

فكر في:
1. ما المطلوب الحقيقي من الرسالة؟
2. ما السياق الثقافي واللغوي؟
3. كيف يتواصل العملاء في هذا المجال عادة؟

اجب في JSON:
{
  "intent": "النية",
  "confidence": 0.92,
  "reasoning": "تفسير مختصر للقرار"
}`;

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
          { role: 'system', content: intelligentPrompt },
          { role: 'user', content: `انية: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 150
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      intent: result.intent || 'general',
      confidence: Math.min(0.98, result.confidence || 0.6),
      reasoning: result.reasoning || 'تحليل ذكي للرسالة'
    };
  } catch (error) {
    logger.error('Error understanding intent from meaning:', error);
    return {
      intent: 'general',
      confidence: 0.4,
      reasoning: 'تحليل احتياطي بسبب خطأ في المعالجة'
    };
  }
}

/**
 * تحليل المشاعر المتقدم
 * يحلل المشاعر الأساسية والحالة العاطفية للعميل
 */
async function analyzeSentiment(
  message: string,
  conversationHistory: string[],
  businessContext: any
): Promise<{
  primary_emotion: string;
  intensity: number;
  emotional_indicators: string[];
  sentiment_score: number;
  emotional_state: string;
  urgency_detected: boolean;
}> {
  try {
    const recentContext = conversationHistory.slice(-5).join('\n');
    
    const sentimentPrompt = `أنت محلل نفسي ومشاعري متخصص. حلل هذه الرسالة والسياق لتحديد المشاعر والحالة العاطفية.

السياق التجاري: ${businessContext.industry}
أسلوب التواصل: ${businessContext.communicationStyle}

المحادثة السابقة:
${recentContext}

الرسالة الحالية: "${message}"

حدد بدقة:
1. المشاعر الأساسية (excited, frustrated, satisfied, neutral, concerned, angry, happy, confused, urgent)
2. شدة المشاعر (0-1)
3. المؤشرات العاطفية الموجودة في النص
4. درجة الإيجابية/السلبية (-1 إلى 1)
5. الحالة العاطفية بالعربية
6. هل يوجد استعجال أو إلحاح؟

اجب في JSON:
{
  "primary_emotion": "المشاعر الأساسية",
  "intensity": 0.8,
  "emotional_indicators": ["مؤشر1", "مؤشر2"],
  "sentiment_score": 0.5,
  "emotional_state": "وصف الحالة العاطفية بالعربية",
  "urgency_detected": false
}`;

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
          { role: 'system', content: sentimentPrompt },
          { role: 'user', content: `حلل المشاعر: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      primary_emotion: result.primary_emotion || 'neutral',
      intensity: Math.min(1, Math.max(0, result.intensity || 0.5)),
      emotional_indicators: result.emotional_indicators || [],
      sentiment_score: Math.min(1, Math.max(-1, result.sentiment_score || 0)),
      emotional_state: result.emotional_state || 'حالة عادية',
      urgency_detected: result.urgency_detected || false
    };
  } catch (error) {
    logger.error('Error analyzing sentiment:', error);
    return {
      primary_emotion: 'neutral',
      intensity: 0.5,
      emotional_indicators: [],
      sentiment_score: 0,
      emotional_state: 'تعذر تحليل المشاعر',
      urgency_detected: false
    };
  }
}

/**
 * تحليل مرحلة العميل في رحلة الشراء
 * يحدد أين يقف العميل في مسار التحويل
 */
async function determineCustomerStage(
  message: string,
  conversationHistory: string[],
  businessContext: any,
  sentimentAnalysis: any
): Promise<{
  current_stage: string;
  stage_confidence: number;
  progression_indicators: string[];
  next_expected_action: string;
  conversion_probability: number;
}> {
  try {
    const recentContext = conversationHistory.slice(-10).join('\n');
    
    const stagePrompt = `أنت محلل رحلة العميل متخصص في ${businessContext.industry}. 
    
حلل هذه المحادثة لتحديد مرحلة العميل:

السياق:
- المجال: ${businessContext.industry}
- الحالة العاطفية: ${sentimentAnalysis.emotional_state}
- المشاعر: ${sentimentAnalysis.primary_emotion}

المحادثة:
${recentContext}

الرسالة الحالية: "${message}"

حدد المرحلة من:
- awareness: يكتشف المشكلة/الحاجة
- consideration: يبحث عن الحلول ويقارن
- decision: قريب من اتخاذ القرار
- purchase: جاهز للشراء أو يسأل عن التفاصيل النهائية  
- support: عميل حالي يحتاج مساعدة
- retention: عميل حالي قد يفكر في الإلغاء

اجب في JSON:
{
  "current_stage": "المرحلة",
  "stage_confidence": 0.85,
  "progression_indicators": ["مؤشر1", "مؤشر2"],
  "next_expected_action": "الإجراء المتوقع التالي",
  "conversion_probability": 0.7
}`;

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
          { role: 'system', content: stagePrompt },
          { role: 'user', content: `حلل المرحلة: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 180
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      current_stage: result.current_stage || 'awareness',
      stage_confidence: Math.min(1, Math.max(0, result.stage_confidence || 0.5)),
      progression_indicators: result.progression_indicators || [],
      next_expected_action: result.next_expected_action || 'متابعة المحادثة',
      conversion_probability: Math.min(1, Math.max(0, result.conversion_probability || 0.3))
    };
  } catch (error) {
    logger.error('Error determining customer stage:', error);
    return {
      current_stage: 'awareness',
      stage_confidence: 0.3,
      progression_indicators: [],
      next_expected_action: 'متابعة المحادثة',
      conversion_probability: 0.3
    };
  }
}

/**
 * استخراج المنتج أو الخدمة المطلوبة
 * يحلل النص لفهم ما يريده العميل بالتحديد
 */
async function extractProductInterest(
  message: string,
  conversationHistory: string[],
  businessContext: any
): Promise<{
  requested_item: string | null;
  category: string | null;
  specifications: string[];
  price_range_discussed: boolean;
  urgency_level: string;
  decision_factors: string[];
}> {
  try {
    const recentContext = conversationHistory.slice(-8).join('\n');
    
    const productPrompt = `أنت محلل منتجات وخدمات متخصص في ${businessContext.industry}.

السياق التجاري:
- المجال: ${businessContext.industry}
- المصطلحات: ${businessContext.detectedTerms.join(', ')}

المحادثة:
${recentContext}

الرسالة الحالية: "${message}"

استخرج:
1. المنتج/الخدمة المطلوبة (إن وجد)
2. فئة المنتج
3. المواصفات أو المتطلبات المذكورة
4. هل تم مناقشة السعر؟
5. مستوى الاستعجال (low, medium, high)
6. العوامل المؤثرة في القرار

اجب في JSON:
{
  "requested_item": "اسم المنتج/الخدمة أو null",
  "category": "فئة المنتج أو null", 
  "specifications": ["مواصفة1", "مواصفة2"],
  "price_range_discussed": false,
  "urgency_level": "medium",
  "decision_factors": ["عامل1", "عامل2"]
}`;

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
          { role: 'system', content: productPrompt },
          { role: 'user', content: `استخرج المنتج: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 150
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      requested_item: result.requested_item || null,
      category: result.category || null,
      specifications: result.specifications || [],
      price_range_discussed: result.price_range_discussed || false,
      urgency_level: result.urgency_level || 'medium',
      decision_factors: result.decision_factors || []
    };
  } catch (error) {
    logger.error('Error extracting product interest:', error);
    return {
      requested_item: null,
      category: null,
      specifications: [],
      price_range_discussed: false,
      urgency_level: 'low',
      decision_factors: []
    };
  }
}

/**
 * وظيفة التعلم من النجاح
 * تحفظ الأنماط الناجحة لتحسين الأداء المستقبلي
 */
async function learnFromSuccess(
  instanceId: string,
  message: string,
  businessContext: any,
  intent: string,
  confidence: number
): Promise<void> {
  try {
    await supabaseAdmin.rpc('learn_from_successful_intent', {
      p_whatsapp_instance_id: instanceId,
      p_message: message,
      p_business_context: businessContext,
      p_intent: intent,
      p_confidence: confidence,
      p_timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error learning from success:', error);
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
    
    // محاولة استخدام الدالة المُصلحة
    const { data, error } = await supabaseAdmin.rpc('get_contextual_personality', {
      p_whatsapp_instance_id: instanceId,
      p_intent: intent,
      p_business_context: businessContext
    });

    if (error) {
      logger.warn('get_contextual_personality failed, using fallback:', error.message);
      
      // Fallback إلى النظام القديم
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin.rpc('get_personality_for_intent', {
        p_whatsapp_instance_id: instanceId,
        p_intent_category: intent,
        p_confidence: 0.8
      });
      
      if (fallbackError) {
        logger.error('Fallback personality function also failed:', fallbackError.message);
        return null;
      }
      
      const personality = fallbackData?.[0] || null;
      logger.debug(`Fallback personality found:`, !!personality);
      return personality;
    }

    const personality = data?.[0] || null;
    logger.debug(`Smart personality found:`, !!personality);
    
    if (personality) {
      logger.debug(`Selected personality: ${personality.personality_name} for intent: ${intent}`);
    } else {
      logger.warn(`No personality found for intent: ${intent}, instance: ${instanceId}`);
      
      // تجربة البحث عن شخصية عامة كآخر محاولة
      const { data: generalData } = await supabaseAdmin
        .from('ai_personalities')
        .select('id as personality_id, name as personality_name, system_prompt, temperature')
        .eq('whatsapp_instance_id', instanceId)
        .eq('is_active', true)
        .or('intent_category.eq.general,intent_category.is.null')
        .order('usage_count', { ascending: false })
        .limit(1)
        .single();
        
      if (generalData) {
        logger.debug(`Using general personality as fallback: ${generalData.personality_name}`);
        return generalData;
      }
    }
    
    return personality;
  } catch (error) {
    logger.error('Error getting smart personality:', error);
    return null;
  }
}

/**
 * النظام الذكي المتكامل - نسخة محسنة
 * يجمع كل الوظائف في تحليل واحد ذكي شامل
 */
async function smartIntentAnalysis(
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
  
  // 1. فهم السياق التجاري
  const businessContext = await analyzeBusinessContext(conversationHistory);
  
  // 2. فهم النية من المعنى
  const intentResult = await understandIntentFromMeaning(message, businessContext);
  
  // 3. تحليل المشاعر والحالة العاطفية
  const emotionAnalysis = await analyzeSentiment(message, conversationHistory, businessContext);
  
  // 4. تحديد مرحلة العميل في رحلة الشراء
  const customerJourney = await determineCustomerStage(
    message, 
    conversationHistory, 
    businessContext, 
    emotionAnalysis
  );
  
  // 5. استخراج المنتج أو الخدمة المطلوبة
  const productInterest = await extractProductInterest(message, conversationHistory, businessContext);
  
  // 6. الحصول على الشخصية المناسبة (مع مراعاة التحليلات الجديدة)
  const selectedPersonality = await getSmartPersonality(instanceId, intentResult.intent, businessContext);
  
  // 6.1. تحديث عداد استخدام الشخصية إذا تم العثور عليها
  if (selectedPersonality?.personality_id) {
    try {
      await supabaseAdmin.rpc('increment_personality_usage', {
        p_personality_id: selectedPersonality.personality_id
      });
    } catch (error) {
      logger.error('Error incrementing personality usage:', error);
    }
  }
  
  // 7. التعلم من هذا التحليل (مع البيانات الجديدة)
  await learnFromSuccess(instanceId, message, businessContext, intentResult.intent, intentResult.confidence);
  
  return {
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    businessContext,
    reasoning: intentResult.reasoning,
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
    const { 
      message, 
      whatsappInstanceId, 
      userId, 
      conversationHistory = [],
      useCache = true
    } = await req.json() as SmartIntentRequest;

    if (!message || !whatsappInstanceId || !userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: message, whatsappInstanceId, userId' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    logger.log(`Smart intent analysis for: "${message.substring(0, 50)}..."`);

    // التحليل الذكي المتكامل
    const analysisResult = await smartIntentAnalysis(
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
      // FIX: توحيد أسماء الحقول - استخدام selectedPersonality بدلاً من selected_personality
      selectedPersonality: analysisResult.selectedPersonality ? {
        id: analysisResult.selectedPersonality.personality_id,
        name: analysisResult.selectedPersonality.personality_name,
        system_prompt: analysisResult.selectedPersonality.system_prompt,
        temperature: analysisResult.selectedPersonality.temperature
      } : undefined,
      // إضافة حقول إضافية للتوافق مع النظام القديم
      selected_personality: analysisResult.selectedPersonality ? {
        id: analysisResult.selectedPersonality.personality_id,
        name: analysisResult.selectedPersonality.personality_name,
        system_prompt: analysisResult.selectedPersonality.system_prompt,
        temperature: analysisResult.selectedPersonality.temperature
      } : undefined,
      reasoning: analysisResult.reasoning,
      processingTimeMs,
      cacheHit: false,
      // البيانات الجديدة المُطورة
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

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Error in smart intent analysis:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        intent: 'general',
        confidence: 0.1,
        businessContext: {
          industry: 'عام',
          communicationStyle: 'ودي',
          detectedTerms: []
        },
        reasoning: 'حدث خطأ في التحليل',
        processingTimeMs: Date.now() - startTime,
        cacheHit: false,
        // بيانات افتراضية للخطأ
        emotionAnalysis: {
          primary_emotion: 'neutral',
          intensity: 0.5,
          emotional_indicators: [],
          sentiment_score: 0,
          emotional_state: 'تعذر تحليل المشاعر',
          urgency_detected: false
        },
        customerJourney: {
          current_stage: 'unknown',
          stage_confidence: 0.1,
          progression_indicators: [],
          next_expected_action: 'المحاولة مرة أخرى',
          conversion_probability: 0.0
        },
        productInterest: {
          requested_item: null,
          category: null,
          specifications: [],
          price_range_discussed: false,
          urgency_level: 'low',
          decision_factors: []
        }
      } as SmartIntentResult),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});