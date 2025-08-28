# 🧪 دليل اختبار نظام التصعيد المُصحح

## ✅ **الإصلاح المُطبق:**
- **المشكلة:** كان النظام يبحث في جدول `whatsapp_messages` غير الموجود
- **الحل:** الآن يبحث في `whatsapp_ai_interactions` (الجدول الصحيح)
- **الثقة:** تُقرأ من `metadata.intent_confidence` بدلاً من حقل غير موجود

## 🧪 **كيفية اختبار "Attempts Before Escalation":**

### **الإعداد للاختبار:**

1. **اضبط العتبة على 2** (بدلاً من 3) لاختبار أسرع:
   ```
   Attempts Before Escalation: 2
   ```

2. **تأكد من تفعيل النظام:**
   ```
   Enable Escalation System: ✅ مُفعل
   ```

### **سيناريو الاختبار:**

#### **الخطوة 1: أرسل رسائل غامضة لخفض الثقة**
```
رسالة 1: "ما هذا؟"
رسالة 2: "لا أفهم شيئاً"
رسالة 3: "أريد شيئاً ما"
```

#### **الخطوة 2: راقب السلوك المتوقع**
- **بعد الرسالة الأولى:** AI يحاول الرد (ثقة منخفضة)
- **بعد الرسالة الثانية:** AI يحاول مرة أخرى (ثقة منخفضة)
- **بعد الرسالة الثالثة:** **تصعيد تلقائي** 🚨

#### **الخطوة 3: تحقق من التصعيد**
- **رسالة التصعيد:** ستصل للعميل
- **تنبيه فريق الدعم:** سيرسل لجميع الأرقام المُفعلة
- **سجل التصعيد:** سيظهر في "Escalated Conversations"

## 📊 **مراقبة البيانات:**

### **في قاعدة البيانات:**

```sql
-- فحص التفاعلات الأخيرة والثقة
SELECT 
  user_phone,
  user_message,
  metadata->>'intent_confidence' as confidence,
  created_at
FROM whatsapp_ai_interactions 
WHERE whatsapp_instance_id = 'YOUR_INSTANCE_ID'
  AND user_phone = 'CUSTOMER_PHONE'
ORDER BY created_at DESC 
LIMIT 5;

-- فحص التصعيدات
SELECT *
FROM escalated_conversations
WHERE whatsapp_number = 'CUSTOMER_PHONE'
ORDER BY escalated_at DESC;
```

### **في Logs:**
ابحث عن هذه الرسائل:
```
"Escalation needed: Low confidence threshold exceeded"
"lowConfidenceCount: X, threshold: Y"
```

## 🎯 **اختبارات إضافية:**

### **اختبار الكلمات المفتاحية (يجب أن تعمل كما هي):**
```
"أريد التحدث مع موظف"
"human support"
"customer service"
```
**النتيجة المتوقعة:** تصعيد فوري (بدون محاولات)

### **اختبار المواضيع الحساسة:**
```
"لدي شكوى"
"أريد استرداد الأموال"
"complaint"
```
**النتيجة المتوقعة:** تصعيد فوري

## 🔧 **استكشاف الأخطاء:**

### **إذا لم يعمل التصعيد:**

1. **تحقق من تفعيل النظام:**
   - `escalation_enabled = true`

2. **تحقق من وجود رقم دعم مُفعل:**
   - على الأقل رقم واحد في "Support Team Numbers"
   - الرقم يجب أن يكون `is_active = true`

3. **تحقق من العتبة:**
   - `escalation_threshold` منطقية (2-5)

4. **راجع Logs:**
   - ابحث عن "Low confidence threshold exceeded"
   - تحقق من قيم confidence في interactions

## 🚀 **استعادة النسخة السابقة (إذا لزم الأمر):**

```bash
# استعادة webhook
cp /path/to/whatsapp-webhook/index.ts.backup /path/to/whatsapp-webhook/index.ts

# استعادة process-buffered-messages  
cp /path/to/process-buffered-messages/index.ts.backup /path/to/process-buffered-messages/index.ts
```

---

**ملاحظة:** الإصلاح لا يؤثر إلا على "Attempts Before Escalation". باقي أنواع التصعيد تعمل بشكل طبيعي.