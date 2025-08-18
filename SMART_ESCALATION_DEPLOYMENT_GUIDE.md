# دليل نشر النظام الذكي للتصعيد

## 🚀 خطوات النشر

### 1. تشغيل المايغريشن (Migrations)

```bash
# تشغيل جميع المايغريشن الجديدة
npx supabase db push

# أو تشغيل محدد
npx supabase migration up
```

### 2. نشر الدوال (Edge Functions)

```bash
# نشر جميع الدوال
npx supabase functions deploy

# أو نشر محددة
npx supabase functions deploy whatsapp-webhook
npx supabase functions deploy smart-intent-analyzer
```

### 3. تحديث الواجهة الأمامية

```bash
# بناء المشروع
npm run build

# نشر على الخادم
npm run deploy
```

## 🧪 خطوات الاختبار

### 1. اختبار قاعدة البيانات

```sql
-- التحقق من إنشاء الجداول
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%smart_escalation%';

-- التحقق من الفهارس
SELECT indexname FROM pg_indexes 
WHERE tablename LIKE '%smart_escalation%';

-- اختبار الدوال
SELECT is_smart_escalation_enabled('user-id', 'instance-id');
```

### 2. اختبار الواجهة الأمامية

1. **الدخول إلى صفحة إعدادات الدعم**
2. **التحقق من ظهور تبويب "Smart Escalation"**
3. **اختبار إعدادات التصعيد الذكي**
4. **تشغيل الاختبارات التلقائية**

### 3. اختبار Edge Functions

```bash
# اختبار دالة تحليل النوايا
curl -X POST "https://your-project.supabase.co/functions/v1/smart-intent-analyzer" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "أحتاج مساعدة عاجلة",
    "whatsappInstanceId": "instance-id",
    "userId": "user-id",
    "conversationHistory": []
  }'

# اختبار webhook
curl -X POST "https://your-project.supabase.co/functions/v1/whatsapp-webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "test-instance",
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "1234567890@s.whatsapp.net",
        "fromMe": false,
        "id": "test-id"
      },
      "message": {
        "conversation": "أحتاج مساعدة"
      },
      "messageTimestamp": 1234567890,
      "pushName": "Test User"
    }
  }'
```

## 🔧 تكوين النظام

### 1. تفعيل النظام الذكي

```sql
-- تفعيل النظام للمستخدم
UPDATE profiles 
SET enable_smart_escalation_global = true 
WHERE id = 'user-id';

-- إنشاء إعدادات افتراضية لinstance
INSERT INTO smart_escalation_config (whatsapp_instance_id, user_id)
VALUES ('instance-id', 'user-id')
ON CONFLICT (whatsapp_instance_id) DO NOTHING;
```

### 2. ضبط المعايير

- **حساسية التصعيد**: 0.7 (افتراضي)
- **حد المشاعر السلبية**: 0.8
- **حد الاستعجال**: 0.7
- **حد ثقة RAG**: 0.6
- **عدد محاولات الذكاء الاصطناعي**: 2

## 📊 مراقبة الأداء

### 1. استعلامات المراقبة

```sql
-- إحصائيات التصعيد
SELECT * FROM smart_escalation_analytics;

-- أداء النظام الذكي
SELECT 
  decision_type,
  COUNT(*) as total,
  AVG(confidence_score) as avg_confidence,
  AVG(processing_time_ms) as avg_processing_time
FROM smart_escalation_audit 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY decision_type;

-- معدل نجاح الذكاء الاصطناعي
SELECT 
  escalation_decision,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM smart_escalation_audit 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY escalation_decision;
```

### 2. تنبيهات الأداء

راقب هذه المؤشرات:
- **وقت المعالجة > 5 ثوانٍ**
- **معدل الأخطاء > 5%**
- **معدل التصعيد الفوري > 30%**
- **معدل ثقة منخفض < 0.5**

## 🐛 استكشاف الأخطاء

### 1. أخطاء شائعة

**خطأ: "Smart escalation config not found"**
```sql
-- إنشاء إعداد افتراضي
INSERT INTO smart_escalation_config (whatsapp_instance_id, user_id)
VALUES ('instance-id', 'user-id');
```

**خطأ: "Intent analysis failed"**
- تحقق من مفاتيح OpenAI API
- تحقق من حدود الاستخدام
- راجع logs الدالة

**خطأ: "RAG context not available"**
- تحقق من وجود محتوى في document_chunks
- تحقق من إعدادات embedding
- راجع حدود التشابه

### 2. تشخيص المشاكل

```sql
-- تحقق من logs التصعيد
SELECT * FROM smart_escalation_audit 
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- تحقق من الأخطاء
SELECT * FROM webhook_debug_logs 
WHERE category LIKE '%ESCALATION%'
AND created_at >= NOW() - INTERVAL '1 hour';
```

## 🔄 التراجع عن النشر (Rollback)

### 1. تعطيل النظام الذكي

```sql
-- تعطيل النظام عالمياً
UPDATE profiles SET enable_smart_escalation_global = false;

-- تعطيل لinstance محدد
UPDATE smart_escalation_config 
SET enable_smart_escalation = false 
WHERE whatsapp_instance_id = 'instance-id';
```

### 2. العودة للنظام التقليدي

النظام التقليدي سيعمل تلقائياً عند تعطيل النظام الذكي، لا حاجة لتغييرات إضافية.

## 📈 تحسين الأداء

### 1. ضبط المعايير

بناءً على البيانات التشغيلية:
- **قلل حساسية التصعيد** إذا كان هناك تصعيد مفرط
- **زد حد الثقة RAG** إذا كانت الإجابات غير دقيقة
- **اضبط حد المشاعر** حسب نوع العملاء

### 2. تحسين المحتوى

- **أضف محتوى أكثر لقاعدة المعرفة**
- **حسن تصنيف المواضيع**
- **حدث الشخصيات AI بانتظام**

## ✅ قائمة التحقق النهائية

- [ ] تم تشغيل جميع المايغريشن
- [ ] تم نشر جميع Edge Functions
- [ ] تم اختبار الواجهة الأمامية
- [ ] تم التحقق من عمل النظام الذكي
- [ ] تم إعداد المراقبة
- [ ] تم اختبار سيناريوهات مختلفة
- [ ] تم التأكد من خطة التراجع
- [ ] تم تدريب فريق الدعم

## 🎯 النتائج المتوقعة

بعد النشر الناجح:
- **تقليل التصعيدات غير الضرورية بنسبة 40-60%**
- **تحسين وقت الاستجابة للعملاء**
- **زيادة رضا العملاء**
- **توفير في تكاليف الدعم البشري**
- **بيانات أفضل لتحليل احتياجات العملاء**