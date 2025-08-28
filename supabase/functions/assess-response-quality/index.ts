import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args)
};

interface QualityAssessmentRequest {
  message: string;
  intentData: any;
  businessContext: any;
  searchResults: any;
  languageDetection?: any;
  fileIds: string[];
  instanceId: string;
}

interface QualityAssessmentResult {
  success: boolean;
  responseQuality: number;
  shouldEscalate: boolean;
  reasoning: string;
  adaptiveFactors: any;
  assessmentType: string;
}

/**
 * تقييم وضوح السؤال بناءً على اللغة ونوع العمل المُكتشف
 */
function assessQuestionClarity(
  message: string,
  businessContext: any,
  languageDetection: any
): number {
  
  const messageLength = message.trim().length;
  const wordCount = message.trim().split(/\s+/).length;
  
  // تكيف مع اللغة المُكتشفة
  const isArabic = languageDetection?.primaryLanguage === 'ar';
  const avgWordsPerSentence = isArabic ? 8 : 6; // العربية تتطلب كلمات أكثر
  
  let clarityScore = 0.5; // بداية متوسطة
  
  // A. تقييم التفصيل بناءً على طول الرسالة
  if (wordCount >= avgWordsPerSentence) {
    clarityScore += 0.3; // سؤال مفصل = وضوح أعلى
  } else if (wordCount < 3) {
    clarityScore -= 0.4; // سؤال قصير جداً = غموض
  }
  
  // B. تحليل نوع السؤال بناءً على المصطلحات المُكتشفة
  const detectedTerms = businessContext?.detectedTerms || [];
  if (detectedTerms.length > 2) {
    clarityScore += 0.2; // مصطلحات تجارية واضحة
  }
  
  // C. التكيف مع أسلوب التواصل المُكتشف
  const commStyle = businessContext?.communicationStyle;
  if (commStyle === 'formal' || commStyle === 'professional') {
    clarityScore += 0.1; // الأسلوب الرسمي عادة أوضح
  }
  
  // D. تحليل أنماط الأسئلة الغامضة متعددة اللغات
  const vaguePatternsArabic = ['ما هذا', 'لا أفهم', 'أريد شيئاً', 'مش عارف', 'إيه ده'];
  const vaguePatternsEnglish = ['what is this', 'i dont understand', 'i want something', 'help me', 'what'];
  
  const messageNormalized = message.toLowerCase().trim();
  const isVague = isArabic ? 
    vaguePatternsArabic.some(pattern => messageNormalized.includes(pattern.toLowerCase())) :
    vaguePatternsEnglish.some(pattern => messageNormalized.includes(pattern));
    
  if (isVague) {
    clarityScore -= 0.3; // تقليل النقاط للرسائل الغامضة
  }
  
  return Math.max(0.1, Math.min(0.9, clarityScore));
}

/**
 * تقييم توفر السياق بناءً على نتائج البحث الدلالي
 */
function assessContextAvailability(
  searchResults: any,
  businessContext: any,
  fileIds: string[]
): number {
  
  let contextScore = 0.0;
  
  // A. تقييم جودة البحث الدلالي الموجود
  if (searchResults?.success && searchResults?.results && searchResults.results.length > 0) {
    const bestSimilarity = searchResults.results[0].similarity;
    
    // تحويل similarity إلى context score
    if (bestSimilarity >= 0.8) {
      contextScore = 0.9; // سياق ممتاز
    } else if (bestSimilarity >= 0.6) {
      contextScore = 0.7; // سياق جيد
    } else if (bestSimilarity >= 0.4) {
      contextScore = 0.5; // سياق متوسط
    } else {
      contextScore = 0.2; // سياق ضعيف
    }
    
    // مكافأة إضافية للنتائج المتعددة عالية الجودة
    const goodMatches = searchResults.results.filter((r: any) => r.similarity >= 0.6).length;
    if (goodMatches > 1) {
      contextScore += 0.1;
    }
  }
  
  // B. تقييم توفر قاعدة المعرفة للعمل
  if (fileIds.length === 0) {
    contextScore = Math.min(contextScore, 0.3); // لا يوجد ملفات = سياق محدود
  } else if (fileIds.length >= 5) {
    contextScore += 0.1; // قاعدة معرفة شاملة
  }
  
  // C. تقييم فهم السياق التجاري
  const businessConfidence = businessContext?.confidence || 0.5;
  contextScore = (contextScore * 0.8) + (businessConfidence * 0.2);
  
  return Math.max(0.0, Math.min(1.0, contextScore));
}

/**
 * تقييم تطابق الغرض مع المحتوى المتوفر
 */
function assessIntentRelevance(
  intentData: any,
  businessContext: any,
  searchResults: any
): number {
  
  let relevanceScore = 0.5;
  
  // A. استخدام ثقة الغرض الموجودة
  const intentConfidence = intentData?.confidence || 0.5;
  relevanceScore = (relevanceScore + intentConfidence) / 2;
  
  // B. تقييم التطابق مع نوع العمل
  const detectedIndustry = businessContext?.industry;
  if (detectedIndustry && detectedIndustry !== 'عام' && detectedIndustry !== 'general') {
    relevanceScore += 0.1; // صناعة محددة = فهم أفضل للسياق
  }
  
  // C. تقييم تطابق المحتوى الموجود مع الغرض
  if (searchResults?.success && searchResults?.results) {
    const hasRelevantContent = searchResults.results.some((r: any) => 
      r.similarity >= 0.6 && r.content.length > 100
    );
    if (hasRelevantContent) {
      relevanceScore += 0.2;
    }
  }
  
  return Math.max(0.1, Math.min(0.9, relevanceScore));
}

/**
 * التقييم النهائي التكيفي للجودة
 */
function calculateAdaptiveResponseQuality(
  message: string,
  intentData: any,
  businessContext: any,
  searchResults: any,
  languageDetection: any,
  fileIds: string[]
): {
  responseQuality: number;
  shouldEscalate: boolean;
  reasoning: string;
  adaptiveFactors: any;
} {
  
  // 1. تقييم المكونات بناءً على البيانات المُكتشفة ديناميكياً
  const questionClarity = assessQuestionClarity(message, businessContext, languageDetection);
  const contextAvailability = assessContextAvailability(searchResults, businessContext, fileIds);
  const intentRelevance = assessIntentRelevance(intentData, businessContext, searchResults);
  
  // 2. حساب الجودة المرجحة (أوزان تكيفية)
  let weights = { clarity: 0.3, context: 0.5, intent: 0.2 };
  
  // تكييف الأوزان بناءً على نوع العمل المُكتشف
  const industry = businessContext?.industry?.toLowerCase() || '';
  if (industry.includes('تقني') || industry.includes('tech')) {
    weights = { clarity: 0.4, context: 0.4, intent: 0.2 }; // التقنية تحتاج وضوح أكثر
  } else if (industry.includes('مبيعات') || industry.includes('sales')) {
    weights = { clarity: 0.2, context: 0.6, intent: 0.2 }; // المبيعات تعتمد على المحتوى
  } else if (industry.includes('طبي') || industry.includes('medical')) {
    weights = { clarity: 0.4, context: 0.5, intent: 0.1 }; // الطب يحتاج دقة عالية
  }
  
  // 3. الحساب النهائي
  const responseQuality = 
    (questionClarity * weights.clarity) +
    (contextAvailability * weights.context) + 
    (intentRelevance * weights.intent);
  
  // 4. تحديد العتبات التكيفية بناءً على نوع العمل
  let escalationThreshold = 0.4; // افتراضي
  
  // تكييف العتبة بناءً على نوع العمل
  if (industry.includes('طبي') || industry.includes('medical')) {
    escalationThreshold = 0.6; // الطب يحتاج دقة أعلى
  } else if (industry.includes('تعليم') || industry.includes('education')) {
    escalationThreshold = 0.5; // التعليم يحتاج دقة معتدلة
  } else if (industry.includes('ترفيه') || industry.includes('entertainment')) {
    escalationThreshold = 0.3; // الترفيه أكثر مرونة
  } else if (industry.includes('مالي') || industry.includes('finance')) {
    escalationThreshold = 0.6; // المالية تحتاج دقة عالية
  }
  
  // 5. قرار التصعيد التكيفي
  const shouldEscalate = responseQuality < escalationThreshold;
  
  const reasoning = `Quality: ${responseQuality.toFixed(2)} | Threshold: ${escalationThreshold} | ` +
    `Clarity: ${questionClarity.toFixed(2)} | Context: ${contextAvailability.toFixed(2)} | ` +
    `Intent: ${intentRelevance.toFixed(2)} | Industry: ${industry || 'general'}`;
  
  return {
    responseQuality,
    shouldEscalate,
    reasoning,
    adaptiveFactors: {
      questionClarity,
      contextAvailability,
      intentRelevance,
      escalationThreshold,
      businessAdaptations: {
        detectedIndustry: industry,
        adaptedWeights: weights,
        adaptedThreshold: escalationThreshold,
        languageContext: languageDetection?.primaryLanguage || 'ar'
      }
    }
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
      intentData,
      businessContext,
      searchResults,
      languageDetection,
      fileIds,
      instanceId
    } = await req.json() as QualityAssessmentRequest;

    if (!message || !instanceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Message and instanceId are required',
          responseQuality: 0.5,
          shouldEscalate: false,
          reasoning: 'Invalid input parameters',
          assessmentType: 'error'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    logger.info('🎯 Starting Adaptive Response Quality Assessment:', {
      instanceId,
      messagePreview: message.substring(0, 50) + '...',
      messageLength: message.length,
      detectedIndustry: businessContext?.industry,
      intentType: intentData?.intent,
      intentConfidence: intentData?.confidence,
      hasSearchResults: !!searchResults?.success,
      searchResultCount: searchResults?.results?.length || 0,
      bestSimilarity: searchResults?.results?.[0]?.similarity || 0,
      fileCount: fileIds?.length || 0,
      primaryLanguage: languageDetection?.primaryLanguage || 'unknown'
    });

    // تقييم جودة الاستجابة باستخدام البيانات المُكتشفة ديناميكياً
    const qualityAssessment = calculateAdaptiveResponseQuality(
      message,
      intentData,
      businessContext,
      searchResults,
      languageDetection || { primaryLanguage: 'ar' },
      fileIds || []
    );

    const processingTime = Date.now() - startTime;

    logger.info('✅ Adaptive Quality Assessment Complete:', {
      instanceId,
      responseQuality: qualityAssessment.responseQuality,
      shouldEscalate: qualityAssessment.shouldEscalate,
      reasoning: qualityAssessment.reasoning,
      processingTimeMs: processingTime,
      businessAdaptations: qualityAssessment.adaptiveFactors.businessAdaptations
    });

    const result: QualityAssessmentResult = {
      success: true,
      responseQuality: qualityAssessment.responseQuality,
      shouldEscalate: qualityAssessment.shouldEscalate,
      reasoning: qualityAssessment.reasoning,
      adaptiveFactors: qualityAssessment.adaptiveFactors,
      assessmentType: 'adaptive_dynamic'
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('❌ Error in adaptive quality assessment:', {
      error: error.message || error,
      stack: error.stack,
      processingTimeMs: processingTime
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
        responseQuality: 0.5, // fallback safe value
        shouldEscalate: false, // conservative fallback
        reasoning: `Assessment failed: ${error.message || 'Unknown error'}`,
        assessmentType: 'fallback',
        adaptiveFactors: null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});