# 📦 Code Snippets جاهزة للتنفيذ - المعالجة المتوازية

## 1️⃣ ملف المساعد الأساسي: `_shared/parallel-queries.ts`

```typescript
/**
 * Parallel Query Utilities for Supabase Edge Functions
 * 
 * يوفر دوال مساعدة لتنفيذ استعلامات متعددة بالتوازي
 * مع معالجة أخطاء قوية وlogging مفصل
 */

// Logger
const logger = {
  log: (...args: any[]) => console.log('[PARALLEL]', ...args),
  error: (...args: any[]) => console.error('[PARALLEL-ERROR]', ...args),
  info: (...args: any[]) => console.info('[PARALLEL-INFO]', ...args),
  warn: (...args: any[]) => console.warn('[PARALLEL-WARN]', ...args),
  debug: (...args: any[]) => console.debug('[PARALLEL-DEBUG]', ...args),
};

/**
 * ينفذ استعلامات متعددة بالتوازي مع Promise.all
 * يفشل إذا فشل أي استعلام
 */
export async function executeParallel<T extends any[]>(
  queries: [...{ [K in keyof T]: Promise<T[K]> }],
  queryNames?: string[]
): Promise<T> {
  const startTime = Date.now();
  
  try {
    logger.info(`Executing ${queries.length} queries in parallel`);
    const results = await Promise.all(queries);
    
    const duration = Date.now() - startTime;
    logger.info(`All queries completed in ${duration}ms`);
    
    return results as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Parallel execution failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * ينفذ استعلامات متعددة بالتوازي مع Promise.allSettled
 * لا يفشل حتى لو فشلت بعض الاستعلامات
 */
export async function executeSafeParallel<T extends any[]>(
  queries: [...{ [K in keyof T]: Promise<T[K]> }],
  defaultValues: T,
  queryNames?: string[]
): Promise<T> {
  const startTime = Date.now();
  
  logger.info(`Executing ${queries.length} queries safely in parallel`);
  const results = await Promise.allSettled(queries);
  
  const processedResults = results.map((result, index) => {
    const queryName = queryNames?.[index] || `Query ${index}`;
    
    if (result.status === 'fulfilled') {
      logger.debug(`✅ ${queryName} succeeded`);
      return result.value;
    } else {
      logger.warn(`⚠️ ${queryName} failed:`, result.reason);
      return defaultValues[index];
    }
  });
  
  const duration = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  logger.info(`Parallel execution completed in ${duration}ms (${successCount}/${queries.length} succeeded)`);
  
  return processedResults as T;
}

/**
 * ينفذ مجموعات من الاستعلامات بالتوازي
 * مفيد عندما يكون لديك استعلامات تعتمد على بعضها
 */
export async function executeBatchedParallel<T>(
  batches: Array<{
    name: string;
    queries: Promise<any>[];
    processor?: (results: any[]) => any;
  }>
): Promise<T> {
  const overallStart = Date.now();
  const results: any = {};
  
  for (const batch of batches) {
    const batchStart = Date.now();
    logger.info(`Executing batch: ${batch.name}`);
    
    try {
      const batchResults = await Promise.all(batch.queries);
      const processed = batch.processor ? batch.processor(batchResults) : batchResults;
      results[batch.name] = processed;
      
      const batchDuration = Date.now() - batchStart;
      logger.info(`✅ Batch ${batch.name} completed in ${batchDuration}ms`);
    } catch (error) {
      logger.error(`❌ Batch ${batch.name} failed:`, error);
      results[batch.name] = null;
    }
  }
  
  const totalDuration = Date.now() - overallStart;
  logger.info(`All batches completed in ${totalDuration}ms`);
  
  return results as T;
}
```

---

## 2️⃣ تحسين process-buffered-messages - الكود الكامل

### الجزء المحسن (السطور 390-450):

```typescript
// استبدل الكود من السطر 390 إلى 450 بهذا:

import { executeSafeParallel } from '../_shared/parallel-queries.ts';

// ...

// ============= بداية التحسين =============

// المرحلة 1: الاستعلامات الأساسية المتوازية
logger.info('Starting parallel queries phase 1');

const [
  isDuplicate,
  conversationHistory,
  webhookConfigResult,
  escalationCheckResult
] = await executeSafeParallel(
  [
    // Query 1: فحص التكرار
    checkForDuplicateMessage(conversationId, combinedMessage, supabaseAdmin),
    
    // Query 2: جلب سجل المحادثة
    getRecentConversationHistory(conversationId, 800, supabaseAdmin),
    
    // Query 3: جلب إعدادات webhook
    supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('webhook_url')
      .eq('whatsapp_instance_id', instanceData.id)
      .maybeSingle(),
    
    // Query 4: فحص التصعيد (مشروط)
    instanceData.escalation_enabled 
      ? isConversationEscalated(instanceData.id, userPhone)
      : Promise.resolve(false)
  ],
  // القيم الافتراضية في حالة الفشل
  [false, [], null, false],
  // أسماء الاستعلامات للـ logging
  ['Duplicate Check', 'Conversation History', 'Webhook Config', 'Escalation Check']
);

// معالجة نتيجة التكرار
if (isDuplicate) {
  logger.info('Skipping: Combined message is duplicate');
  await markBufferAsProcessed(instanceName, userPhone);
  return true;
}

// تخزين الرسالة (يجب أن يحدث بعد فحص التكرار)
await storeMessageInConversation(
  conversationId, 
  'user', 
  combinedMessage, 
  `buffered_${Date.now()}`, 
  supabaseAdmin
);

// معالجة URL الـ instance
let instanceBaseUrl = '';
const latestMessageData = buffer.messages[buffer.messages.length - 1]?.messageData;

if (latestMessageData?.server_url) {
  instanceBaseUrl = latestMessageData.server_url;
} else if (webhookConfigResult?.webhook_url) {
  const url = new URL(webhookConfigResult.webhook_url);
  instanceBaseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
} else {
  instanceBaseUrl = Deno.env.get('EVOLUTION_API_URL') || DEFAULT_EVOLUTION_API_URL;
}

// المرحلة 2: معالجة التصعيد إذا لزم
if (instanceData.escalation_enabled && escalationCheckResult) {
  logger.info('Conversation is already escalated, processing escalation flow');
  
  // استعلام متوازي للرسائل الأخيرة
  const recentMessages = await supabaseAdmin
    .from('whatsapp_messages')
    .select('content, created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'assistant')
    .eq('content', escalatedMessage)
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);
    
  // باقي معالجة التصعيد...
}

// ============= نهاية التحسين =============
```

---

## 3️⃣ تحسين checkEscalationNeeded في whatsapp-webhook

```typescript
async function checkEscalationNeeded(
  message: string, 
  phoneNumber: string,
  instanceId: string,
  conversationId: string,
  aiResponseConfidence?: number
): Promise<{ needsEscalation: boolean; reason: string }> {
  try {
    // ============= تحسين: استعلامات متوازية =============
    const [instanceResult, interactionsResult] = await Promise.allSettled([
      // Query 1: جلب إعدادات التصعيد
      supabaseAdmin
        .from('whatsapp_instances')
        .select('escalation_enabled, escalation_threshold, escalation_keywords')
        .eq('id', instanceId)
        .single(),
      
      // Query 2: جلب سجل التفاعلات
      supabaseAdmin
        .from('whatsapp_ai_interactions')
        .select('metadata, created_at, user_message')
        .eq('whatsapp_instance_id', instanceId)
        .eq('user_phone', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);
    
    // معالجة نتائج الاستعلام الأول
    if (instanceResult.status === 'rejected') {
      logger.error('Failed to fetch instance config:', instanceResult.reason);
      return { needsEscalation: false, reason: '' };
    }
    
    const instance = instanceResult.value.data;
    if (!instance?.escalation_enabled) {
      return { needsEscalation: false, reason: '' };
    }
    
    // معالجة نتائج الاستعلام الثاني
    const interactions = interactionsResult.status === 'fulfilled' 
      ? interactionsResult.value.data 
      : null;
    // ============= نهاية التحسين =============
    
    // باقي الكود كما هو...
    // 1. Check for direct escalation keywords
    const keywords = instance.escalation_keywords || [
      'human support', 'speak to someone', 'agent', 'representative',
      'talk to person', 'customer service', 'help me', 'support team'
    ];
    
    const lowerMessage = message.toLowerCase();
    const hasEscalationKeyword = keywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    if (hasEscalationKeyword) {
      logger.info('Escalation needed: User requested human support', { phoneNumber });
      return { needsEscalation: true, reason: 'user_request' };
    }
    
    // معالجة التفاعلات إذا كانت متاحة
    if (interactions && interactions.length > 0) {
      // Check for repeated questions
      const userMessages = interactions.map(i => i.user_message);
      const uniqueMessages = new Set(userMessages.map(m => m.toLowerCase()));
      
      if (userMessages.length >= 3 && uniqueMessages.size === 1) {
        logger.info('Escalation needed: Repeated question detected', { phoneNumber });
        return { needsEscalation: true, reason: 'repeated_question' };
      }
      
      // Check for low response quality
      const lowQualityCount = interactions.filter(i => {
        const responseQuality = i.metadata?.response_quality;
        return responseQuality && parseFloat(responseQuality) < 0.4;
      }).length;
      
      if (lowQualityCount >= instance.escalation_threshold) {
        logger.info('Escalation needed: Low response quality threshold exceeded');
        return { needsEscalation: true, reason: 'low_confidence' };
      }
    }
    
    // 3. Check for sensitive topics
    const sensitiveKeywords = [
      'complaint', 'legal', 'lawyer', 'refund', 'compensation',
      'issue', 'problem', 'dispute', 'billing', 'charge'
    ];
    
    const hasSensitiveTopic = sensitiveKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
    
    if (hasSensitiveTopic) {
      logger.info('Escalation needed: Sensitive topic detected', { phoneNumber });
      return { needsEscalation: true, reason: 'sensitive_topic' };
    }
    
    return { needsEscalation: false, reason: '' };
  } catch (error) {
    logger.error('Error checking escalation need:', error);
    return { needsEscalation: false, reason: '' };
  }
}
```

---

## 4️⃣ تحسين findOrCreateConversation

```typescript
async function findOrCreateConversation(instanceId: string, userPhone: string) {
  try {
    // ============= تحسين: استعلام واحد بدلاً من اثنين =============
    // بدلاً من البحث عن active ثم inactive، نبحث عن أي محادثة
    const { data: conversation, error: findError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, status')
      .eq('instance_id', instanceId)
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (findError && findError.code !== 'PGRST116') {
      logger.error('Error finding conversation:', findError);
    }
    
    // إذا وجدنا محادثة
    if (conversation) {
      // إذا كانت نشطة، نرجع الـ ID مباشرة
      if (conversation.status === 'active') {
        return conversation.id;
      }
      
      // إذا كانت غير نشطة، نحدثها
      const { data: updatedConversation, error: updateError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          status: 'active',
          last_activity: new Date().toISOString(),
          conversation_data: { 
            context: {
              last_update: new Date().toISOString(),
              message_count: 0,
              reactivated: true
            }
          }
        })
        .eq('id', conversation.id)
        .select('id')
        .single();
      
      if (updateError) throw updateError;
      
      logger.info(`Reactivated conversation ${conversation.id}`);
      return updatedConversation.id;
    }
    // ============= نهاية التحسين =============
    
    // إذا لم نجد أي محادثة، ننشئ واحدة جديدة
    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        user_phone: userPhone,
        status: 'active',
        conversation_data: { 
          context: {
            last_update: new Date().toISOString(),
            message_count: 0,
            created_at: new Date().toISOString()
          }
        }
      })
      .select('id')
      .single();
    
    if (createError) throw createError;
    
    logger.info(`New conversation created: ${newConversation.id}`);
    return newConversation.id;
    
  } catch (error) {
    logger.error('Error in findOrCreateConversation:', error);
    throw error;
  }
}
```

---

## 5️⃣ مثال: معالجة رسائل متعددة بالتوازي

```typescript
// إذا كان لديك رسائل متعددة لمعالجتها
async function processBatchMessages(messages: any[]) {
  // تقسيم الرسائل إلى مجموعات (batches)
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }
  
  // معالجة كل batch بالتوازي
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(message => processMessage(message))
    );
    
    // log النتائج
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(`Failed to process message ${batch[index].id}:`, result.reason);
      } else {
        logger.info(`Successfully processed message ${batch[index].id}`);
      }
    });
  }
}
```

---

## 📊 قياس الأداء

```typescript
// دالة مساعدة لقياس الوقت
function measureTime(label: string) {
  const start = Date.now();
  return {
    end: () => {
      const duration = Date.now() - start;
      logger.info(`⏱️ ${label}: ${duration}ms`);
      return duration;
    }
  };
}

// استخدام:
const timer = measureTime('Parallel Queries');
const results = await Promise.all([...]);
timer.end();
```

---

## ⚡ نصائح للتنفيذ

1. **ابدأ بتحسين واحد صغير** واختبره جيداً
2. **استخدم Promise.allSettled** للاستعلامات غير الحرجة
3. **استخدم Promise.all** للاستعلامات الحرجة
4. **أضف logging مفصل** لتتبع الأداء
5. **احتفظ بنسخة من الكود القديم** كتعليق للمرجع

---

*هذه الأكواد جاهزة للنسخ واللصق مع تعديلات طفيفة حسب احتياجاتك*