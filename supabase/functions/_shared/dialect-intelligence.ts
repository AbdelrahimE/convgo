/**
 * نظام الذكاء اللهجي المتقدم
 * يفهم جميع اللهجات العربية ديناميكياً بدون قوائم كلمات ثابتة
 */

import { getNextOpenAIKey } from "./openai-key-rotation.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

export interface DialectAnalysis {
  primaryDialect: string;
  confidence: number;
  region: string;
  culturalMarkers: string[];
  formalityLevel: 'formal' | 'casual' | 'very_casual';
  emotionalTone: string;
  languageMix: {
    arabic: number;
    english: number;
    numbers: number;
    other: number;
  };
}

export interface CommunicationStyle {
  directness: 'direct' | 'indirect' | 'very_indirect';
  politeness: 'formal' | 'polite' | 'casual' | 'familiar';
  urgency: 'urgent' | 'normal' | 'relaxed';
  technicality: 'technical' | 'business' | 'casual' | 'simple';
}

/**
 * حفظ بيانات اللهجة في قاعدة البيانات
 */
async function saveDialectData(
  whatsappInstanceId: string,
  dialectAnalysis: DialectAnalysis
): Promise<void> {
  try {
    const { data: existing, error: findError } = await supabaseAdmin
      .from('dialect_adaptation_data')
      .select('id, usage_count')
      .eq('whatsapp_instance_id', whatsappInstanceId)
      .eq('primary_dialect', dialectAnalysis.primaryDialect)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('dialect_adaptation_data')
        .update({
          confidence: dialectAnalysis.confidence,
          formality_level: dialectAnalysis.formalityLevel,
          emotional_tone: dialectAnalysis.emotionalTone,
          cultural_markers: dialectAnalysis.culturalMarkers,
          language_mix: dialectAnalysis.languageMix,
          usage_count: existing.usage_count + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) {
        logger.error('Error updating dialect data:', error);
      }
    } else {
      const { error } = await supabaseAdmin
        .from('dialect_adaptation_data')
        .insert({
          whatsapp_instance_id: whatsappInstanceId,
          primary_dialect: dialectAnalysis.primaryDialect,
          region: dialectAnalysis.region,
          confidence: dialectAnalysis.confidence,
          formality_level: dialectAnalysis.formalityLevel,
          emotional_tone: dialectAnalysis.emotionalTone,
          cultural_markers: dialectAnalysis.culturalMarkers,
          language_mix: dialectAnalysis.languageMix,
          usage_count: 1,
          last_used_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Error inserting dialect data:', error);
      }
    }
  } catch (error) {
    logger.error('Exception saving dialect data:', error);
  }
}

/**
 * التحليل الذكي للهجة والأسلوب اللغوي
 * يفهم اللهجة من السياق والنمط اللغوي بدلاً من كلمات محددة
 */
export async function analyzeDialectIntelligently(text: string, whatsappInstanceId?: string): Promise<DialectAnalysis> {
  try {
    const dialectPrompt = `أنت خبير لغوي متخصص في اللهجات العربية. حلل هذا النص:

"${text}"

حدد بدقة:
1. اللهجة الأساسية (مصرية، خليجية، شامية، مغاربية، سودانية، يمنية، عراقية، إلخ)
2. المنطقة الجغرافية
3. العلامات الثقافية واللغوية المميزة
4. مستوى الرسمية (رسمي، عادي، عامي جداً)
5. النبرة العاطفية (ودود، محايد، غاضب، متحمس، إلخ)
6. نسبة اللغات (عربي، إنجليزي، أرقام، أخرى)

اجب في JSON فقط:
{
  "primaryDialect": "اسم اللهجة",
  "confidence": 0.85,
  "region": "المنطقة الجغرافية",
  "culturalMarkers": ["علامة1", "علامة2", "..."],
  "formalityLevel": "formal/casual/very_casual",
  "emotionalTone": "النبرة العاطفية",
  "languageMix": {
    "arabic": 80,
    "english": 15,
    "numbers": 5,
    "other": 0
  }
}`;

    const apiKey = getNextOpenAIKey();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: dialectPrompt },
          { role: 'user', content: `حلل: "${text}"` }
        ],
        temperature: 0.1,
        max_tokens: 300
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    const dialectAnalysis = {
      primaryDialect: result.primaryDialect || 'عربية عامة',
      confidence: result.confidence || 0.5,
      region: result.region || 'غير محدد',
      culturalMarkers: result.culturalMarkers || [],
      formalityLevel: result.formalityLevel || 'casual',
      emotionalTone: result.emotionalTone || 'محايد',
      languageMix: result.languageMix || {
        arabic: 80,
        english: 15,
        numbers: 5,
        other: 0
      }
    };

    if (whatsappInstanceId) {
      await saveDialectData(whatsappInstanceId, dialectAnalysis);
    }

    return dialectAnalysis;
  } catch (error) {
    logger.error('Error analyzing dialect intelligently:', error);
    
    // تحليل احتياطي بسيط
    return {
      primaryDialect: detectBasicDialect(text),
      confidence: 0.3,
      region: 'غير محدد',
      culturalMarkers: [],
      formalityLevel: detectFormality(text),
      emotionalTone: 'محايد',
      languageMix: analyzeLanguageMix(text)
    };
  }
}

/**
 * تحليل أسلوب التواصل لتحسين الرد
 */
export async function analyzeCommunicationStyle(text: string, dialectAnalysis: DialectAnalysis): Promise<CommunicationStyle> {
  try {
    const stylePrompt = `بناء على تحليل اللهجة، حلل أسلوب التواصل:

النص: "${text}"
اللهجة: ${dialectAnalysis.primaryDialect}
المنطقة: ${dialectAnalysis.region}
مستوى الرسمية: ${dialectAnalysis.formalityLevel}

حدد:
1. المباشرة (مباشر، غير مباشر، غير مباشر جداً)
2. الأدب (رسمي، مؤدب، عادي، مألوف)
3. الاستعجال (عاجل، عادي، مسترخي)
4. التقنية (تقني، تجاري، عادي، بسيط)

اجب في JSON:
{
  "directness": "direct/indirect/very_indirect",
  "politeness": "formal/polite/casual/familiar", 
  "urgency": "urgent/normal/relaxed",
  "technicality": "technical/business/casual/simple"
}`;

    const apiKey = getNextOpenAIKey();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: stylePrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 100
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const result = JSON.parse(responseData.choices[0].message.content);

    return {
      directness: result.directness || 'direct',
      politeness: result.politeness || 'polite',
      urgency: result.urgency || 'normal',
      technicality: result.technicality || 'casual'
    };
  } catch (error) {
    logger.error('Error analyzing communication style:', error);
    
    return {
      directness: 'direct',
      politeness: 'polite',
      urgency: 'normal',
      technicality: 'casual'
    };
  }
}

/**
 * توليد استجابة مناسبة ثقافياً ولهجياً
 */
export async function generateCulturallyAwareResponse(
  originalMessage: string,
  dialectAnalysis: DialectAnalysis,
  communicationStyle: CommunicationStyle,
  baseResponse: string
): Promise<string> {
  try {
    const culturalPrompt = `كخبير لغوي، اضبط هذا الرد ليناسب اللهجة والثقافة:

الرسالة الأصلية: "${originalMessage}"
اللهجة: ${dialectAnalysis.primaryDialect}
المنطقة: ${dialectAnalysis.region}
الأسلوب: ${communicationStyle.politeness}
المباشرة: ${communicationStyle.directness}
الاستعجال: ${communicationStyle.urgency}

الرد الأساسي: "${baseResponse}"

اضبط الرد ليكون:
1. مناسب للهجة المستخدمة
2. متسق مع مستوى الأدب والرسمية
3. مناسب للثقافة المحلية
4. طبيعي وودود

لا تغير المعنى، فقط اضبط الأسلوب واللهجة.`;

    const apiKey = getNextOpenAIKey();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: culturalPrompt },
          { role: 'user', content: `اضبط: "${baseResponse}"` }
        ],
        temperature: 0.2,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    return responseData.choices[0].message.content || baseResponse;
  } catch (error) {
    logger.error('Error generating culturally aware response:', error);
    return baseResponse;
  }
}

/**
 * كشف بسيط للهجة (احتياطي)
 */
function detectBasicDialect(text: string): string {
  const lowerText = text.toLowerCase();
  
  // مؤشرات بسيطة للهجات الرئيسية
  if (lowerText.includes('ازيك') || lowerText.includes('ايه') || lowerText.includes('ده') || lowerText.includes('كده')) {
    return 'مصرية';
  }
  
  if (lowerText.includes('شلونك') || lowerText.includes('وياك') || lowerText.includes('ويا') || lowerText.includes('اكو')) {
    return 'خليجية';
  }
  
  if (lowerText.includes('كيفك') || lowerText.includes('شو') || lowerText.includes('هاد') || lowerText.includes('هيك')) {
    return 'شامية';
  }
  
  if (lowerText.includes('كيداير') || lowerText.includes('واش') || lowerText.includes('بصح') || lowerText.includes('غادي')) {
    return 'مغاربية';
  }
  
  return 'عربية عامة';
}

/**
 * كشف مستوى الرسمية (احتياطي)
 */
function detectFormality(text: string): 'formal' | 'casual' | 'very_casual' {
  const formalMarkers = ['حضرتك', 'سيادتك', 'المحترم', 'أتشرف', 'تفضل'];
  const casualMarkers = ['ازيك', 'شلونك', 'كيفك', 'هلا', 'اهلين'];
  const veryCasualMarkers = ['يعني', 'بس', 'خلاص', 'ماشي', 'اوكي'];
  
  const lowerText = text.toLowerCase();
  
  if (formalMarkers.some(marker => lowerText.includes(marker))) {
    return 'formal';
  }
  
  if (veryCasualMarkers.some(marker => lowerText.includes(marker))) {
    return 'very_casual';
  }
  
  return 'casual';
}

/**
 * تحليل مزيج اللغات (احتياطي)
 */
function analyzeLanguageMix(text: string): { arabic: number; english: number; numbers: number; other: number } {
  const chars = text.split('');
  let arabic = 0, english = 0, numbers = 0, other = 0;
  
  for (const char of chars) {
    if (/[\u0600-\u06FF]/.test(char)) {
      arabic++;
    } else if (/[a-zA-Z]/.test(char)) {
      english++;
    } else if (/[0-9]/.test(char)) {
      numbers++;
    } else {
      other++;
    }
  }
  
  const total = chars.length;
  return {
    arabic: Math.round((arabic / total) * 100),
    english: Math.round((english / total) * 100),
    numbers: Math.round((numbers / total) * 100),
    other: Math.round((other / total) * 100)
  };
}

/**
 * الحصول على اقتراحات تحسين الرد حسب اللهجة
 */
export function getDialectSpecificImprovements(dialectAnalysis: DialectAnalysis): string[] {
  const improvements: string[] = [];
  
  switch (dialectAnalysis.primaryDialect) {
    case 'مصرية':
      improvements.push('استخدم "ازيك" بدلاً من "كيف حالك"');
      improvements.push('استخدم "ايه رأيك" بدلاً من "ما رأيك"');
      break;
      
    case 'خليجية':
      improvements.push('استخدم "شلونك" بدلاً من "كيف حالك"');
      improvements.push('استخدم "تسلم" في نهاية الجملة');
      break;
      
    case 'شامية':
      improvements.push('استخدم "كيفك" بدلاً من "كيف حالك"');
      improvements.push('استخدم "شو" بدلاً من "ماذا"');
      break;
      
    case 'مغاربية':
      improvements.push('استخدم "كيداير" بدلاً من "كيف حالك"');
      improvements.push('استخدم "واش" بدلاً من "هل"');
      break;
  }
  
  if (dialectAnalysis.formalityLevel === 'very_casual') {
    improvements.push('استخدم أسلوب أكثر ودية وأقل رسمية');
  }
  
  if (dialectAnalysis.emotionalTone === 'متحمس') {
    improvements.push('أضف تعبيرات حماسية مناسبة');
  }
  
  return improvements;
}