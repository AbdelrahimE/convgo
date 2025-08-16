/**
 * نظام التعلم السياقي الذكي
 * يتعلم من التفاعلات الناجحة ويحسن الأداء تلقائياً
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

export interface LearningPattern {
  businessType: string;
  commonPhrases: string[];
  successfulIntents: { intent: string; confidence: number; count: number }[];
  communicationStyle: string;
  culturalNuances: string[];
}

export interface SuccessMetrics {
  totalInteractions: number;
  accuracyRate: number;
  averageConfidence: number;
  lastUpdated: string;
}

/**
 * حفظ نمط تعلم جديد من تفاعل ناجح
 */
export async function saveSuccessfulPattern(
  supabaseAdmin: any,
  instanceId: string,
  message: string,
  businessContext: any,
  intent: string,
  confidence: number,
  userFeedback?: 'positive' | 'negative'
): Promise<boolean> {
  try {
    const patternData = {
      whatsapp_instance_id: instanceId,
      message_text: message,
      business_context: businessContext,
      detected_intent: intent,
      confidence_score: confidence,
      user_feedback: userFeedback || null,
      created_at: new Date().toISOString(),
      success: true
    };

    const { error } = await supabaseAdmin
      .from('intent_learning_history')
      .insert(patternData);

    if (error) {
      logger.error('Error saving learning pattern:', error);
      return false;
    }

    // تحديث إحصائيات النجاح
    await updateSuccessMetrics(supabaseAdmin, instanceId, intent, confidence, true);
    
    logger.debug('Learning pattern saved successfully', {
      instanceId,
      intent,
      confidence,
      businessType: businessContext.industry
    });

    return true;
  } catch (error) {
    logger.error('Exception saving learning pattern:', error);
    return false;
  }
}

/**
 * استرجاع الأنماط المتعلمة لمجال عمل معين
 */
export async function getLearnedPatterns(
  supabaseAdmin: any,
  instanceId: string,
  businessType?: string
): Promise<LearningPattern[]> {
  try {
    let query = supabaseAdmin
      .from('intent_learning_history')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(100);

    if (businessType) {
      query = query.contains('business_context', { industry: businessType });
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error getting learned patterns:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // تجميع الأنماط حسب نوع العمل
    const patternsByBusiness = data.reduce((acc: any, record: any) => {
      const businessType = record.business_context?.industry || 'عام';
      
      if (!acc[businessType]) {
        acc[businessType] = {
          businessType,
          commonPhrases: [],
          successfulIntents: [],
          communicationStyle: record.business_context?.communicationStyle || 'ودي',
          culturalNuances: []
        };
      }

      // إضافة العبارات الشائعة
      if (record.message_text && !acc[businessType].commonPhrases.includes(record.message_text)) {
        acc[businessType].commonPhrases.push(record.message_text);
      }

      // إضافة النوايا الناجحة
      const existingIntent = acc[businessType].successfulIntents.find(
        (i: any) => i.intent === record.detected_intent
      );
      
      if (existingIntent) {
        existingIntent.count++;
        existingIntent.confidence = (existingIntent.confidence + record.confidence_score) / 2;
      } else {
        acc[businessType].successfulIntents.push({
          intent: record.detected_intent,
          confidence: record.confidence_score,
          count: 1
        });
      }

      return acc;
    }, {});

    return Object.values(patternsByBusiness) as LearningPattern[];
  } catch (error) {
    logger.error('Exception getting learned patterns:', error);
    return [];
  }
}

/**
 * تحديث مقاييس النجاح
 */
async function updateSuccessMetrics(
  supabaseAdmin: any,
  instanceId: string,
  intent: string,
  confidence: number,
  isSuccess: boolean
): Promise<void> {
  try {
    await supabaseAdmin.rpc('update_intent_success_metrics', {
      p_whatsapp_instance_id: instanceId,
      p_intent: intent,
      p_confidence: confidence,
      p_is_success: isSuccess,
      p_timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating success metrics:', error);
  }
}

/**
 * الحصول على مقاييس الأداء الحالية
 */
export async function getPerformanceMetrics(
  supabaseAdmin: any,
  instanceId: string
): Promise<SuccessMetrics | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('intent_performance_metrics')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      totalInteractions: data.total_interactions || 0,
      accuracyRate: data.accuracy_rate || 0,
      averageConfidence: data.average_confidence || 0,
      lastUpdated: data.updated_at || new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    return null;
  }
}

/**
 * تحليل ذكي للأنماط المتعلمة لتحسين التصنيف
 */
export async function analyzeLearnedPatternsForIntent(
  supabaseAdmin: any,
  instanceId: string,
  message: string,
  businessContext: any
): Promise<{
  suggestedIntent: string;
  confidence: number;
  reasoning: string;
} | null> {
  try {
    const patterns = await getLearnedPatterns(supabaseAdmin, instanceId, businessContext.industry);
    
    if (patterns.length === 0) {
      return null;
    }

    // البحث عن أنماط مشابهة
    const messageWords = message.toLowerCase().split(/\s+/);
    let bestMatch = { intent: 'general', confidence: 0, reasoning: 'لا يوجد نمط مطابق' };

    for (const pattern of patterns) {
      for (const phrase of pattern.commonPhrases) {
        const phraseWords = phrase.toLowerCase().split(/\s+/);
        const commonWords = messageWords.filter(word => phraseWords.includes(word));
        
        if (commonWords.length > 0) {
          const similarity = commonWords.length / Math.max(messageWords.length, phraseWords.length);
          
          if (similarity > bestMatch.confidence) {
            // العثور على النية الأكثر نجاحاً لهذا النمط
            const topIntent = pattern.successfulIntents.sort((a, b) => b.count - a.count)[0];
            
            if (topIntent) {
              bestMatch = {
                intent: topIntent.intent,
                confidence: similarity * topIntent.confidence,
                reasoning: `نمط متعلم: "${phrase}" -> ${topIntent.intent}`
              };
            }
          }
        }
      }
    }

    return bestMatch.confidence > 0.3 ? bestMatch : null;
  } catch (error) {
    logger.error('Error analyzing learned patterns:', error);
    return null;
  }
}

/**
 * تنظيف البيانات القديمة والاحتفاظ بالأنماط المهمة فقط
 */
export async function cleanupOldLearningData(
  supabaseAdmin: any,
  instanceId: string,
  daysToKeep: number = 30
): Promise<boolean> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error } = await supabaseAdmin
      .from('intent_learning_history')
      .delete()
      .eq('whatsapp_instance_id', instanceId)
      .lt('created_at', cutoffDate.toISOString())
      .eq('success', false); // فقط احذف الفشل، احتفظ بالنجاح

    if (error) {
      logger.error('Error cleaning up old learning data:', error);
      return false;
    }

    logger.info(`Cleaned up old learning data for instance ${instanceId}`);
    return true;
  } catch (error) {
    logger.error('Exception cleaning up old learning data:', error);
    return false;
  }
}

/**
 * تصدير الأنماط المتعلمة لاستخدامها في تدريب المودل
 */
export async function exportLearningPatterns(
  supabaseAdmin: any,
  instanceId: string
): Promise<{
  patterns: LearningPattern[];
  metrics: SuccessMetrics | null;
  exportDate: string;
}> {
  try {
    const patterns = await getLearnedPatterns(supabaseAdmin, instanceId);
    const metrics = await getPerformanceMetrics(supabaseAdmin, instanceId);

    return {
      patterns,
      metrics,
      exportDate: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error exporting learning patterns:', error);
    return {
      patterns: [],
      metrics: null,
      exportDate: new Date().toISOString()
    };
  }
}