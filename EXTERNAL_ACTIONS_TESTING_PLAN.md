# خطة اختبار شاملة لنظام External Actions

## نظرة عامة على النظام

نظام **External Actions** هو نظام متقدم يتيح للمستخدمين إنشاء إجراءات مخصصة تُفَعَّل تلقائياً عند استقبال رسائل WhatsApp محددة.

### المكونات الرئيسية:
1. **واجهة المستخدم (Frontend)**: نموذج من 6 خطوات لإنشاء وتعديل الإجراءات
2. **منطق الخادم (Backend)**:
   - `external-action-executor`: تنفيذ الـ webhooks مع retry logic
   - `external-action-response-handler`: معالجة الاستجابات الديناميكية (V2)
   - `smart-intent-analyzer`: كشف النية واستخراج المتغيرات بالذكاء الاصطناعي
3. **قاعدة البيانات**:
   - `external_actions`: تخزين الإجراءات والإعدادات
   - `external_action_logs`: سجلات التنفيذ المفصلة
   - `external_action_responses`: استجابات الـ webhooks الديناميكية (V2)

### الإمكانيات الرئيسية:
- ✅ كشف تلقائي للنية باستخدام AI مع confidence scoring
- ✅ استخراج المتغيرات الديناميكية من الرسائل
- ✅ تنفيذ Webhooks مع إعادة المحاولة التلقائية (retry + timeout)
- ✅ 4 أنواع من الاستجابات: None, Simple Confirmation, Custom Message, Wait for Webhook
- ✅ سجلات تنفيذ مفصلة مع إحصائيات وفلاتر
- ✅ أداة اختبار مدمجة شاملة

### الخطوات الست في النموذج:
1. **Basic Info**: Display Name, Action Name (lowercase with validation)
2. **Training Examples**: 3 أمثلة على الأقل، multi-language support
3. **Webhook Configuration**: URL, HTTP Method (POST/GET/PUT/PATCH), Custom Headers
4. **Payload & Variables**: Variable extraction prompts, Payload template with {{placeholders}}
5. **Settings**: Confidence Threshold (50%-95%), Retry Attempts (0-5), Timeout (10-120s)
6. **Response Configuration** (V2): 4 response types مع إعدادات لكل نوع

---

## 📋 المحتويات

1. [اختبارات واجهة المستخدم](#1-اختبارات-واجهة-المستخدم)
2. [اختبارات منطق الأعمال](#2-اختبارات-منطق-الأعمال)
3. [اختبارات API والـ Backend](#3-اختبارات-api-والـ-backend)
4. [اختبارات التكامل End-to-End](#4-اختبارات-التكامل-end-to-end)
5. [اختبارات الأداء والحمل](#5-اختبارات-الأداء-والحمل)
6. [اختبارات الأمان](#6-اختبارات-الأمان)
7. [سيناريوهات استخدام حقيقية](#7-سيناريوهات-استخدام-حقيقية)
8. [معالجة الأخطاء والحالات الاستثنائية](#8-معالجة-الأخطاء-والحالات-الاستثنائية)
9. [التوافق والمتصفحات](#9-التوافق-والمتصفحات)
10. [قائمة التحقق النهائية](#10-قائمة-التحقق-النهائية)

---

## 1. اختبارات واجهة المستخدم

### 1.1 الصفحة الرئيسية (External Actions Page)

#### ✅ Test 1.1.1: Empty State
- [ ] عرض رسالة "No external actions yet" مع أيقونة Zap
- [ ] زر "+ Create First Action" موجود ويعمل
- [ ] عند عدم وجود WhatsApp instances: عرض رسالة توضيحية مع زر للاتصال

#### ✅ Test 1.1.2: WhatsApp Instance Selection
- [ ] عرض قائمة منسدلة للأرقام المتصلة فقط
- [ ] Badge "Connected" باللون الأخضر لكل رقم
- [ ] تحديد Instance تلقائياً عند فتح الصفحة
- [ ] تحديث قائمة الإجراءات عند تغيير Instance

#### ✅ Test 1.1.3: عرض قائمة الإجراءات
- [ ] عرض جميع الإجراءات في بطاقات (Cards)
- [ ] Display Name واضح في العنوان
- [ ] عدد Training Examples ظاهر
- [ ] Badge الحالة صحيح: Healthy (>90%), Warning (70-90%), Issues (<70%), Never Used
- [ ] إحصائيات دقيقة: Executions, Success Rate, Avg Response, Last Used
- [ ] Webhook URL معروض مع truncation
- [ ] Switch للتشغيل/الإيقاف يعمل بشكل صحيح

#### ✅ Test 1.1.4: أزرار الإجراءات
- [ ] **Edit**: يفتح نموذج التعديل مع البيانات المحفوظة
- [ ] **Test**: يفتح أداة الاختبار
- [ ] **Logs**: يفتح نافذة السجلات مع Filters
- [ ] **Delete**: يعرض تأكيد ويحذف عند الموافقة

---

### 1.2 نموذج إنشاء/تعديل External Action

#### Step 1: Basic Info ✅

##### Test 1.2.1.1: Validation
- [ ] Display Name فارغ → خطأ "Display name is required"
- [ ] Action Name فارغ → خطأ "Action name is required"
- [ ] Action Name بأحرف كبيرة → خطأ validation
- [ ] Action Name بأحرف خاصة → خطأ validation
- [ ] بيانات صحيحة → الانتقال للخطوة 2

##### Test 1.2.1.2: Progress Indicator
- [ ] عرض 6 خطوات بوضوح
- [ ] Desktop: أيقونات مع checkmarks للخطوات المكتملة
- [ ] Mobile: أرقام فقط (numbers only) بدون أيقونات
- [ ] الخطوة الحالية باللون الأزرق

---

#### Step 2: Training Examples ✅

##### Test 1.2.2.1: إضافة الأمثلة
- [ ] زر "+ Add Training Example" يعمل
- [ ] إدخال نص بالإنجليزية مع اختيار "EN"
- [ ] إدخال نص بالعربية مع اختيار "AR" + RTL support
- [ ] حذف مثال عبر أيقونة 🗑️

##### Test 1.2.2.2: Validation
- [ ] أقل من 3 أمثلة → خطأ "At least 3 training examples are required"
- [ ] 3 أمثلة أو أكثر → الانتقال للخطوة 3

---

#### Step 3: Webhook Configuration ✅

##### Test 1.2.3.1: Webhook URL Validation
- [ ] URL غير صحيح → خطأ "Invalid URL format"
- [ ] حقل فارغ → خطأ "Webhook URL is required"
- [ ] URL صحيح (https://...) → قبول

##### Test 1.2.3.2: HTTP Method
- [ ] عرض الخيارات: POST (default), GET, PUT, PATCH
- [ ] تغيير الطريقة يعمل

##### Test 1.2.3.3: Custom Headers (JSON)
- [ ] JSON غير صحيح → تجاهل التحديث
- [ ] JSON صحيح → حفظ
- [ ] Headers فارغ `{}` → قبول (optional)

---

#### Step 4: Payload & Variables ✅

##### Test 1.2.4.1: Variables Tab
- [ ] زر "+ Add Variable" يعمل
- [ ] إدخال variable name و prompt
- [ ] تعديل اسم متغير **بدون فقدان التركيز (Focus)** → نظام UUID يعمل
- [ ] حذف متغير
- [ ] إضافة 10+ متغيرات بدون تجمد UI

##### Test 1.2.4.2: Payload Template Tab
- [ ] عرض JSON مع المتغيرات الافتراضية: `{{phone_number}}`, `{{message}}`, `{{timestamp}}`
- [ ] عرض المتغيرات المخصصة بصيغة `{{variable_name}}`
- [ ] Available Variables: badges لجميع المتغيرات
- [ ] تعديل Payload يدوياً (إذا كان JSON صحيح)

##### Test 1.2.4.3: Validation
- [ ] Payload فارغ → خطأ "Payload template cannot be empty"

---

#### Step 5: Settings ✅

##### Test 1.2.5.1: Confidence Threshold
- [ ] Slider يعمل من 50% إلى 95% بخطوات 5%
- [ ] Badge يعرض النسبة الحالية بشكل صحيح

##### Test 1.2.5.2: Retry Attempts
- [ ] عرض الخيارات: 0, 1, 2, 3, 5

##### Test 1.2.5.3: Timeout
- [ ] عرض الخيارات: 10, 30, 60, 120 ثانية

---

#### Step 6: Response Configuration (V2) ✅

##### Test 1.2.6.1: Response Types

**1. No Response**
- [ ] اختيار "No Response"
- [ ] إخفاء Confirmation Message field
- [ ] الوصف: "Action executes silently without sending any message"

**2. Simple Confirmation**
- [ ] اختيار "Simple Confirmation"
- [ ] عرض Confirmation Message مع نص افتراضي بالعربية
- [ ] تعديل الرسالة يعمل
- [ ] عرض Response Language selector

**3. Custom Message with Variables**
- [ ] اختيار "Custom Message with Variables"
- [ ] عرض Available Variables في info box
- [ ] Placeholder يحتوي على مثال مع متغيرات
- [ ] إدخال رسالة مع {variable_name} syntax

**4. Wait for Automation Response**
- [ ] اختيار "Wait for Automation Response"
- [ ] عرض Confirmation Message كـ **Fallback Message**
- [ ] عرض Response Timeout Slider (5-120s، افتراضي 30s)
- [ ] Badge يعرض المدة المختارة
- [ ] شرح: "This message will only be sent if the automation platform fails to respond..."

##### Test 1.2.6.2: Response Language
- [ ] عرض الخيارات: Arabic, English, French, Spanish, German
- [ ] القيمة الافتراضية: Arabic

---

#### ✅ Test 1.2.7: الحفظ والإنهاء
- [ ] في الخطوة 6: زر "Create Action" (أو "Update Action" في وضع التعديل)
- [ ] عرض Spinner أثناء الحفظ
- [ ] رسالة نجاح: "Action created successfully"
- [ ] العودة إلى الصفحة الرئيسية
- [ ] عرض الإجراء الجديد في القائمة

---

### 1.3 أداة الاختبار (External Action Tester)

#### ✅ Test 1.3.1: فتح الأداة
- [ ] الضغط على "Test" يفتح Dialog
- [ ] عرض عنوان "Test Action: [اسم الإجراء]"
- [ ] عرض حقل "Test Message" مع Language-aware textarea
- [ ] عرض 4 Tabs: Detection Result, Payload Preview, Response Preview, Execution Result

#### ✅ Test 1.3.2: Test Detection
- [ ] **رسالة مطابقة**: إدخال "I want to buy 5 Samsung phones" → الضغط على "Test Detection"
  - عرض ✅ "Action Detected"
  - Confidence Badge (High/Medium/Low) مع النسبة
  - AI Reasoning واضح
  - Extracted Variables في JSON
  - مقارنة مع Threshold: "Above threshold - would trigger" أو "Below threshold..."
  - تفعيل زر "Execute Webhook"

- [ ] **رسالة غير مطابقة**: إدخال "What's the weather?" → Test
  - عرض ❌ "Action Not Detected"
  - Confidence منخفض
  - تعطيل زر "Execute Webhook"

#### ✅ Test 1.3.3: Payload Preview
- [ ] بعد Detection ناجح، التبديل إلى "Payload Preview"
- [ ] عرض JSON كامل مع استبدال المتغيرات
- [ ] عرض HTTP Method و Webhook URL
- [ ] إذا Response Type = wait_for_webhook:
  - عرض notification box أزرق
  - نص: "Response URL Included"
  - إشارة إلى `_response_url` و `_execution_id`

#### ✅ Test 1.3.4: Response Preview (V2)
- [ ] عرض Response Type مع أيقونة مناسبة
- [ ] **No Response**: رسالة "Action executes silently"
- [ ] **Simple Confirmation**: عرض الرسالة في صندوق أخضر
- [ ] **Custom Message**: عرض الرسالة مع استبدال المتغيرات
- [ ] **Wait for Webhook**: عرض 3 أقسام:
  1. Initial Response: "No immediate response" (أصفر)
  2. Timeout Fallback: الرسالة الاحتياطية مع المدة
  3. Dynamic Response Example: مثال توضيحي (أزرق)
- [ ] عرض Configuration Details: Language, Timeout

#### ✅ Test 1.3.5: Execute Webhook
- [ ] **تنفيذ ناجح**:
  - Spinner أثناء التنفيذ
  - انتقال تلقائي إلى "Execution Result"
  - ✅ "Webhook Executed Successfully"
  - HTTP Status Code (200/202/...)
  - رسالة نجاح مناسبة لكل Status
  - Execution Time و Retry Count
  - Response Data (JSON أو Plain Text)

- [ ] **تنفيذ فاشل**:
  - ❌ "Webhook Execution Failed"
  - HTTP Status Code
  - Error Message
  - Retry Count

- [ ] **Plain Text Response**: عرض في صندوق أخضر مع رسالة "Success Response"
- [ ] **Non-JSON Response**: عرض في صندوق أصفر مع ملاحظة "Note: This response is not JSON format"

#### ✅ Test 1.3.6: Training Examples Reference
- [ ] عرض جميع الأمثلة التدريبية في الأسفل
- [ ] Badge للغة (EN/AR)

---

### 1.4 سجلات التنفيذ (External Action Logs)

#### ✅ Test 1.4.1: فتح السجلات
- [ ] الضغط على "Logs" يفتح Dialog كبير
- [ ] عرض 4 بطاقات إحصائيات: Total, Success Rate, Failed, Avg Time
- [ ] حساب الإحصائيات بشكل صحيح

#### ✅ Test 1.4.2: Filters
- [ ] **Status Filter**: All, Success, Failed, Timeout, Pending
- [ ] **Time Period**: Last 24h, 7d (default), 30d, 90d, All time
- [ ] **Search**: البحث في Error Message, Variables, Conversation ID
- [ ] تطبيق Filters يحدث القائمة والإحصائيات
- [ ] زر "Refresh" يعمل مع spinner

#### ✅ Test 1.4.3: عرض السجلات
- [ ] كل سجل في بطاقة قابلة للنقر
- [ ] Status Badge صحيح: ✅ Success, ❌ Failed, ⏰ Timeout, 🔄 Pending
- [ ] عرض التاريخ والوقت
- [ ] عرض Response Type Badge (V2)
- [ ] عرض Response Status للـ wait_for_webhook
- [ ] عرض HTTP Status Code, Execution Time, Retry Count
- [ ] أيقونة 👁️ للتفاصيل

#### ✅ Test 1.4.4: تفاصيل السجل
- [ ] الضغط على سجل يفتح نافذة تفاصيل
- [ ] عرض 4 بطاقات معلومات أساسية
- [ ] عرض Error Message إن وجد (بطاقة حمراء)
- [ ] عرض Extracted Variables (JSON)
- [ ] عرض Webhook Payload (JSON)
- [ ] عرض Response Configuration (V2):
  - Response Type مع أيقونة
  - Response Status
  - Timeout
  - Configured Message
- [ ] إذا استقبل Response ديناميكي:
  - عرض "Received Response" في صندوق أزرق
  - الرسالة المستقبلة
  - وقت الاستقبال
- [ ] عرض Webhook Response (JSON/Plain Text/Success Text)

#### ✅ Test 1.4.5: Pagination
- [ ] تحميل 20 سجل في البداية
- [ ] زر "Load More" إذا كان هناك المزيد
- [ ] تحميل 20 إضافي عند الضغط

---

## 2. اختبارات منطق الأعمال

### 2.1 Intent Detection

#### ✅ Test 2.1.1: كشف دقيق
- [ ] رسالة مطابقة تماماً → Confidence >= 90%، intent = "external_action"
- [ ] رسالة مشابهة → Confidence 70-90%، كشف ناجح
- [ ] رسالة غير مطابقة → Confidence < 50%، عدم تفعيل

#### ✅ Test 2.1.2: Multi-language
- [ ] رسالة بالعربية → كشف ناجح
- [ ] رسالة مختلطة (عربي/إنجليزي) → كشف ناجح

---

### 2.2 Variable Extraction

#### ✅ Test 2.2.1: أنواع البيانات
- [ ] **نص**: product_name = "iPhone 15"
- [ ] **أرقام**: quantity = "3", budget = "$500"
- [ ] **تواريخ**: delivery_date = "25th December"
- [ ] **أوقات**: appointment_time = "3:30 PM"
- [ ] **Email**: john@example.com
- [ ] **Phone**: +1-555-1234

#### ✅ Test 2.2.2: عدة متغيرات
- [ ] رسالة: "Order 3 blue Samsung phones"
- [ ] استخراج: product_name, quantity, color

#### ✅ Test 2.2.3: متغيرات غير موجودة
- [ ] رسالة بدون قيمة لمتغير → null أو غير موجود في النتيجة

---

### 2.3 Payload Interpolation

#### ✅ Test 2.3.1: استبدال أساسي
- [ ] `{{phone_number}}` → "+1234567890"
- [ ] `{{message}}` → النص الأصلي
- [ ] `{{timestamp}}` → ISO format

#### ✅ Test 2.3.2: استبدال متغيرات مخصصة
- [ ] `{{product_name}}` → "iPhone 15"
- [ ] `{{quantity}}` → "2"

#### ✅ Test 2.3.3: Nested Objects
- [ ] استبدال صحيح في جميع المستويات

#### ✅ Test 2.3.4: متغيرات غير معرفة
- [ ] `{{color}}` (غير موجود) → يبقى كما هو

---

### 2.4 Confidence Threshold

#### ✅ Test 2.4.1: Logic
- [ ] Confidence >= Threshold → تفعيل
- [ ] Confidence < Threshold → عدم تفعيل
- [ ] Confidence = Threshold → تفعيل

---

### 2.5 Response Types (V2)

#### ✅ Test 2.5.1: No Response
- [ ] تنفيذ webhook بنجاح
- [ ] عدم إرسال رسالة
- [ ] لا سجل في external_action_responses

#### ✅ Test 2.5.2: Simple Confirmation
- [ ] تنفيذ webhook
- [ ] إرسال رسالة فوراً
- [ ] تخزين في المحادثة

#### ✅ Test 2.5.3: Custom Message
- [ ] استبدال المتغيرات في الرسالة
- [ ] إرسال الرسالة المخصصة

#### ✅ Test 2.5.4: Wait for Webhook - Success
- [ ] إنشاء سجل pending في external_action_responses
- [ ] عدم إرسال رسالة فورية
- [ ] استقبال response خلال المهلة
- [ ] إرسال response للمستخدم
- [ ] تحديث: response_received = true

#### ✅ Test 2.5.5: Wait for Webhook - Timeout
- [ ] انتظار > timeout_seconds
- [ ] إرسال Fallback Message
- [ ] response_received = false

#### ✅ Test 2.5.6: Wait for Webhook - Response بعد Timeout
- [ ] رفض الاستجابة
- [ ] HTTP 408 "Response timeout exceeded"

---

## 3. اختبارات API والـ Backend

### 3.1 external-action-executor

#### ✅ Test 3.1.1: Successful Execution
- [ ] Request صحيح → HTTP 200
- [ ] Response يحتوي على: success, actionName, httpStatusCode, executionTimeMs, retryCount, responseData, executionLogId
- [ ] إنشاء سجل في external_action_logs

#### ✅ Test 3.1.2: Status Code Handling
- [ ] 202 Accepted → success = true
- [ ] 200 OK → success = true
- [ ] 4xx → success = false، تسجيل الخطأ
- [ ] 5xx → إعادة المحاولة ثم success = false

#### ✅ Test 3.1.3: Retry Logic
- [ ] فشل مرتين ثم نجاح → retryCount = 2، success = true
- [ ] جميع المحاولات تفشل → retryCount = 3، success = false، errorMessage = "Max retries exceeded"

#### ✅ Test 3.1.4: Timeout
- [ ] webhook أبطأ من timeout_seconds → إلغاء الطلب، error يحتوي على "timeout"

#### ✅ Test 3.1.5: Invalid Requests
- [ ] Action ID غير موجود → HTTP 404، "External action not found or inactive"
- [ ] Inactive action → HTTP 404
- [ ] Missing parameters → HTTP 400، "externalActionId and extractedVariables are required"

#### ✅ Test 3.1.6: Response Handling
- [ ] Plain Text Success (e.g., "accepted") → type = "plain_text_success"
- [ ] JSON Parse Error → type = "json_parse_error"، rawResponse محفوظ

#### ✅ Test 3.1.7: Wait for Webhook Support
- [ ] response_type = "wait_for_webhook"
- [ ] Payload يحتوي على `_response_url` و `_execution_id`
- [ ] إنشاء سجل في external_action_responses

---

### 3.2 external-action-response-handler

#### ✅ Test 3.2.1: Successful Response
- [ ] Request صحيح → HTTP 200
- [ ] إرسال رسالة عبر WhatsApp
- [ ] تحديث external_action_responses: response_received = true، received_at محدث
- [ ] تخزين في whatsapp_conversation_messages

#### ✅ Test 3.2.2: Validation
- [ ] بدون execution_log_id → HTTP 400
- [ ] بدون response_message → HTTP 400

#### ✅ Test 3.2.3: Error Cases
- [ ] Pending response not found → HTTP 404، "No pending response found or already processed"
- [ ] Timeout exceeded → HTTP 408، "Response timeout exceeded"
- [ ] WhatsApp send failure → HTTP 500

---

### 3.3 smart-intent-analyzer

#### ✅ Test 3.3.1: Detection
- [ ] رسالة مطابقة → intent = "external_action"، externalAction object كامل
- [ ] رسالة غير مطابقة → intent آخر، لا يوجد externalAction

#### ✅ Test 3.3.2: Multiple Actions
- [ ] رسالة قد تطابق عدة إجراءات → اختيار الأعلى confidence

---

## 4. اختبارات التكامل End-to-End

### ✅ Test 4.1: سيناريو كامل - Simple Confirmation
1. [ ] إنشاء إجراء "Book Appointment"
2. [ ] Training: 3 أمثلة متنوعة
3. [ ] Webhook: Test URL
4. [ ] Variables: date, time
5. [ ] Response Type: Simple Confirmation
6. [ ] حفظ → اختبار → تنفيذ webhook → فحص logs

### ✅ Test 4.2: سيناريو كامل - Wait for Webhook
1. [ ] إنشاء إجراء مع Wait for Webhook
2. [ ] إعداد webhook على منصة خارجية (Zapier/Make)
3. [ ] تفعيل → إرسال response ديناميكي → فحص استقبال Response

---

## 5. اختبارات الأداء والحمل

### ✅ Test 5.1: السرعة
- [ ] Intent Detection: متوسط < 2 ثانية لـ 100 رسالة
- [ ] Webhook Execution: متوسط < 500ms
- [ ] Logs Loading: أول 20 سجل < 500ms

### ✅ Test 5.2: الحمل
- [ ] 100 مستخدم متزامن → جميع الإجراءات تُنفذ بنجاح
- [ ] 100 إجراء في الصفحة الرئيسية → تحميل < 2 ثانية

### ✅ Test 5.3: الذاكرة
- [ ] Payload 1 MB → معالجة ناجحة بدون memory leaks
- [ ] 50 متغير → UI لا يتجمد

---

## 6. اختبارات الأمان

### ✅ Test 6.1: Access Control
- [ ] RLS Policies تعمل: مستخدم لا يستطيع الوصول لإجراءات مستخدم آخر
- [ ] Authorization: API بدون token → HTTP 401

### ✅ Test 6.2: Injection
- [ ] SQL Injection في Action Name → رفض أو escape
- [ ] XSS في Display Name → escape صحيح عند العرض
- [ ] Command Injection في URL → validation

### ✅ Test 6.3: Data Leaks
- [ ] API Logs لا تكشف API keys كاملة
- [ ] Headers الحساسة لا تظهر في UI أو Logs

### ✅ Test 6.4: CORS
- [ ] Request من domain غير مصرح → رفض

---

## 7. سيناريوهات استخدام حقيقية

### ✅ Scenario 7.1: متجر إلكتروني
- إجراء "Create Order" → متغيرات: product_name, quantity → Shopify API
- اختبار: "I want to buy 2 MacBook Pro" → Order ID مُرسل

### ✅ Scenario 7.2: حجز المواعيد
- إجراء "Book Appointment" → Calendly API → Wait for Webhook
- اختبار: "Book with Dr. Ahmed Thursday 10 AM" → Confirmation ديناميكي

### ✅ Scenario 7.3: دعم فني
- إجراء "Create Support Ticket" → Zendesk API
- اختبار: "Critical bug: app crashes" → Ticket ID

### ✅ Scenario 7.4: تسجيل في دورة
- إجراء "Enroll in Course" → LMS API → رابط دفع

---

## 8. معالجة الأخطاء والحالات الاستثنائية

### ✅ Test 8.1: Network Errors
- [ ] فقدان الإنترنت أثناء الإنشاء → رسالة خطأ، احتفاظ بالبيانات
- [ ] Webhook unreachable → إعادة المحاولة → timeout → تسجيل

### ✅ Test 8.2: Data Errors
- [ ] JSON غير صحيح → تجاهل أو validation
- [ ] Extracted variables فارغة → webhook مع null

### ✅ Test 8.3: Database Errors
- [ ] Constraint violation (اسم مكرر) → رفض مع رسالة واضحة
- [ ] Foreign key violation → فشل الحفظ

### ✅ Test 8.4: Webhook Errors
- [ ] 4xx (400, 401, 404, 429) → تسجيل، لا إعادة محاولة
- [ ] 5xx (500, 502, 503) → إعادة محاولة

---

## 9. التوافق والمتصفحات

### ✅ Test 9.1: Browsers
- [ ] Chrome/Edge: عمل كامل
- [ ] Firefox: عمل كامل
- [ ] Safari: عمل كامل

### ✅ Test 9.2: Devices
- [ ] Desktop (1920x1080): Progress Indicator بالأيقونات
- [ ] Tablet (768x1024): Responsive
- [ ] Mobile (375x667): Progress بالأرقام، Buttons stacked

### ✅ Test 9.3: RTL/LTR
- [ ] نص عربي → محاذاة RTL صحيحة
- [ ] نص إنجليزي → محاذاة LTR صحيحة

---

## 10. قائمة التحقق النهائية

### ✅ Functionality
- [ ] إنشاء/تعديل/حذف إجراء
- [ ] جميع الخطوات الـ 6 تعمل
- [ ] أداة الاختبار شاملة
- [ ] السجلات مع Filters
- [ ] جميع Response Types الـ 4
- [ ] Retry logic و Timeout
- [ ] Wait for Webhook كامل

### ✅ Performance
- [ ] تحميل سريع (< 2s)
- [ ] Intent Detection (< 2s)
- [ ] Logs (< 500ms)
- [ ] لا Memory Leaks

### ✅ Security
- [ ] RLS Policies
- [ ] Authorization
- [ ] Injection Protection
- [ ] Data Leaks Prevention

### ✅ UX
- [ ] واجهة بديهية
- [ ] رسائل خطأ واضحة
- [ ] Loading states
- [ ] Empty states
- [ ] Responsive design
- [ ] Accessibility

### ✅ Production Readiness
- [ ] Environment variables
- [ ] Database indexes
- [ ] Error monitoring
- [ ] SSL/HTTPS
- [ ] Logging
- [ ] Documentation

---

## 📊 تقرير النتائج

| الفئة | اختبارات | ✅ ناجح | ❌ فاشل | النسبة |
|-------|---------|---------|---------|--------|
| UI | [ ] | [ ] | [ ] | [ ]% |
| Business Logic | [ ] | [ ] | [ ] | [ ]% |
| API/Backend | [ ] | [ ] | [ ] | [ ]% |
| Integration | [ ] | [ ] | [ ] | [ ]% |
| Performance | [ ] | [ ] | [ ] | [ ]% |
| Security | [ ] | [ ] | [ ] | [ ]% |
| Scenarios | [ ] | [ ] | [ ] | [ ]% |
| Error Handling | [ ] | [ ] | [ ] | [ ]% |
| Compatibility | [ ] | [ ] | [ ] | [ ]% |
| **الإجمالي** | [ ] | [ ] | [ ] | [ ]% |

---

## 🎯 القرار النهائي

- [ ] ✅ **جاهز للإنتاج**: جميع الاختبارات الحرجة ناجحة
- [ ] ⚠️ **جاهز مع ملاحظات**: يحتاج تحسينات لكنه آمن
- [ ] ❌ **غير جاهز**: يحتاج مزيداً من العمل

**التوقيع**: __________________
**التاريخ**: __________________

---

## ملاحظات إضافية

### Critical Tests (يجب أن تنجح 100%)
1. Intent Detection دقيق
2. Webhook execution موثوق
3. Retry logic يعمل
4. Wait for Webhook كامل
5. RLS Policies محمية
6. لا Data Leaks

### Nice to Have
1. Performance optimization
2. Advanced filters
3. Bulk operations
4. Export logs

---

**خلاصة**: هذه الخطة توفر اختبارات شاملة لضمان جاهزية النظام للإنتاج. يُرجى تنفيذ جميع الاختبارات المحددة بـ ✅ كحد أدنى قبل النشر.

---

## 🆕 تحديثات جديدة - Wait for Webhook Implementation

### ✅ التعديلات المنفذة

تم تنفيذ الحل الكامل لدعم `wait_for_webhook` response type:

#### 1. **تعديلات على المعالجات (Processors)**

**الملفات المعدلة:**
- `supabase/functions/_shared/direct-message-processor.ts` (السطور 618-661)
- `supabase/functions/_shared/queue-processor.ts` (السطور 811-854)

**التغييرات:**
- ✅ إضافة منطق `else if` جديد للتعامل مع `wait_for_webhook`
- ✅ إنشاء سجل pending في جدول `external_action_responses`
- ✅ حساب وقت انتهاء الصلاحية بناءً على `response_timeout_seconds`
- ✅ عدم التأثير على Response Types الأخرى (none, simple_confirmation, custom_message)

**الكود المضاف:**
```typescript
else if (intentAnalysis.externalAction.responseType === 'wait_for_webhook') {
  // ⏳ Create pending response record for wait_for_webhook
  const timeoutSeconds = intentAnalysis.externalAction.responseTimeoutSeconds || 30;
  const expiresAt = new Date(Date.now() + (timeoutSeconds * 1000));

  await supabaseAdmin
    .from('external_action_responses')
    .insert({
      execution_log_id: executorResult.executionLogId,
      conversation_id: conversationId,
      user_phone: userPhone,
      instance_name: instanceName,
      response_received: false,
      expires_at: expiresAt.toISOString()
    });
}
```

#### 2. **Timeout Handler Edge Function**

**ملف جديد:** `supabase/functions/external-action-timeout-handler/index.ts`

**الوظيفة:**
- يتم استدعاؤه تلقائياً كل دقيقة بواسطة pg_cron
- يبحث عن السجلات المنتهية الصلاحية في `external_action_responses`
- يرسل رسالة timeout للعملاء الذين لم يستقبلوا رداً من الأتمتة
- يحدث السجلات ويمنع إعادة المعالجة

#### 3. **Cron Job Migration**

**ملف جديد:** `supabase/migrations/external_action_timeout_cron.sql`

**يتضمن:**
- تفعيل `pg_cron` و `pg_net` extensions
- إنشاء cron job يعمل كل دقيقة
- دالة مساعدة `get_external_action_cron_status()` للتحقق من حالة الـ cron

---

### 🔧 خطوات الإعداد (Setup Instructions)

#### الخطوة 1: تطبيق Migration

قم بتشغيل ملف المايجريشن في Supabase SQL Editor:

```sql
-- انسخ محتوى الملف supabase/migrations/external_action_timeout_cron.sql
-- والصقه في SQL Editor ثم نفذه
```

#### الخطوة 2: ⚠️ **إعدادات مطلوبة (CRITICAL)**

بعد تشغيل المايجريشن، **يجب** تكوين إعدادات قاعدة البيانات:

```sql
-- استبدل القيم بقيمك الفعلية
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://xxxxx.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**ملاحظات مهمة:**
- لا تضع `/` في نهاية الـ URL
- Service Role Key موجود في: `Project Settings → API → service_role`
- هذا المفتاح سري - احتفظ به آمناً

#### الخطوة 3: نشر Edge Functions

```bash
# نشر الدالة الجديدة
supabase functions deploy external-action-timeout-handler

# أو نشر جميع الدوال
supabase functions deploy
```

#### الخطوة 4: التحقق من عمل Cron Job

```sql
-- فحص حالة الكرون
SELECT * FROM public.get_external_action_cron_status();

-- يجب أن ترى:
-- jobname: external-action-timeout-handler
-- schedule: * * * * *
-- active: true
```

#### الخطوة 5: فحص سجلات التنفيذ

```sql
-- آخر 10 عمليات تنفيذ للكرون
SELECT * FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job
  WHERE jobname = 'external-action-timeout-handler'
)
ORDER BY start_time DESC
LIMIT 10;
```

---

### 🧪 اختبار Wait for Webhook

#### السيناريو A: استجابة ضمن المهلة (Success Path)

1. **إعداد External Action:**
   - Response Type: `Wait for Automation Response`
   - Response Timeout: `30` ثانية

2. **إعداد Make.com (أو Zapier):**
   - استقبال Webhook من ConvGo
   - معالجة البيانات
   - إرسال POST request إلى `_response_url` من الـ payload:

   ```json
   {
     "execution_log_id": "{{_execution_id}}",
     "response_message": "تم تسجيل طلبك برقم #12345 بنجاح ✅",
     "response_data": {
       "order_id": "12345",
       "status": "confirmed"
     }
   }
   ```

3. **التدفق المتوقع:**
   - ✅ مستخدم يرسل رسالة تطابق External Action
   - ✅ استخراج المتغيرات بنجاح
   - ✅ تنفيذ Webhook مع `_response_url` في الـ payload
   - ✅ **إنشاء سجل pending** في `external_action_responses`
   - ✅ لا يتم إرسال رسالة فورية للعميل
   - ✅ Make.com يعالج البيانات ويرسل استجابة خلال 30 ثانية
   - ✅ `external-action-response-handler` يستقبل الاستجابة
   - ✅ إرسال رسالة الاستجابة للعميل عبر WhatsApp
   - ✅ حفظ الرسالة في المحادثة
   - ✅ تحديث السجل: `response_received = true`

4. **التحقق من السجل:**

   ```sql
   SELECT
     ear.id,
     ear.execution_log_id,
     ear.user_phone,
     ear.response_received,
     ear.response_message,
     ear.created_at,
     ear.received_at,
     ear.expires_at
   FROM external_action_responses ear
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **النتيجة المتوقعة:**
   - `response_received = true`
   - `response_message` يحتوي على الرد من Make.com
   - `received_at` يحتوي على وقت الاستقبال

#### السيناريو B: تجاوز المهلة (Timeout Path)

1. **المحاكاة:**
   - Make.com لا يرسل رد (أو يرسل بعد 30+ ثانية)

2. **التدفق المتوقع:**
   - ✅ نفس الخطوات الأولية من السيناريو A
   - ⏰ مرور 30 ثانية بدون استجابة
   - ✅ Cron job (يعمل كل دقيقة) يكتشف السجل المنتهي
   - ✅ إرسال رسالة timeout للعميل: `"عذراً، انتهت مهلة الاستجابة. يرجى المحاولة مرة أخرى."`
   - ✅ حفظ رسالة timeout في المحادثة
   - ✅ تحديث السجل: `response_received = true`, `response_message = 'TIMEOUT_EXPIRED'`

3. **التحقق:**

   ```sql
   SELECT *
   FROM external_action_responses
   WHERE response_message = 'TIMEOUT_EXPIRED'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

#### السيناريو C: استجابة بعد انتهاء المهلة (Late Response)

1. **المحاكاة:**
   - Make.com يرسل رد بعد 35 ثانية (بعد المهلة)

2. **النتيجة المتوقعة:**
   - ❌ رفض الاستجابة
   - HTTP 408 من `external-action-response-handler`
   - رسالة الخطأ: `"Response timeout exceeded"`

---

### 📊 استعلامات مفيدة للمراقبة

#### 1. السجلات المعلقة (Active Pending)

```sql
SELECT COUNT(*) as active_pending_count
FROM external_action_responses
WHERE response_received = false
  AND expires_at > NOW();
```

#### 2. السجلات المنتهية (Waiting for Cron)

```sql
SELECT
  ear.id,
  ear.user_phone,
  ear.instance_name,
  ear.created_at,
  ear.expires_at,
  EXTRACT(EPOCH FROM (NOW() - ear.expires_at)) as seconds_expired
FROM external_action_responses ear
WHERE ear.response_received = false
  AND ear.expires_at <= NOW()
ORDER BY ear.expires_at ASC;
```

#### 3. معدل النجاح لـ Wait for Webhook

```sql
SELECT
  COUNT(*) as total_responses,
  SUM(CASE WHEN response_message != 'TIMEOUT_EXPIRED' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN response_message = 'TIMEOUT_EXPIRED' THEN 1 ELSE 0 END) as timeouts,
  ROUND(
    100.0 * SUM(CASE WHEN response_message != 'TIMEOUT_EXPIRED' THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as success_rate
FROM external_action_responses
WHERE created_at > NOW() - INTERVAL '7 days';
```

#### 4. أبطأ وأسرع الاستجابات

```sql
SELECT
  ear.execution_log_id,
  ear.user_phone,
  EXTRACT(EPOCH FROM (ear.received_at - ear.created_at)) as response_time_seconds,
  ear.response_message
FROM external_action_responses ear
WHERE ear.response_received = true
  AND ear.response_message != 'TIMEOUT_EXPIRED'
ORDER BY response_time_seconds DESC
LIMIT 10;
```

---

### 🐛 استكشاف الأخطاء (Troubleshooting)

#### المشكلة 1: Cron Job لا يعمل

**الأعراض:** السجلات المنتهية لا تتم معالجتها

**الحلول:**
```sql
-- 1. فحص وجود الكرون
SELECT * FROM cron.job WHERE jobname = 'external-action-timeout-handler';

-- 2. فحص الإعدادات
SHOW app.settings.supabase_url;
SHOW app.settings.service_role_key;

-- 3. إذا كانت فارغة، قم بتكوينها (راجع الخطوة 2)

-- 4. فحص آخر عمليات التنفيذ
SELECT
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'external-action-timeout-handler')
ORDER BY start_time DESC
LIMIT 5;
```

#### المشكلة 2: Callback من Make.com لا يصل

**التحقق:**
```sql
-- فحص السجلات المعلقة
SELECT *
FROM external_action_responses
WHERE response_received = false
ORDER BY created_at DESC
LIMIT 10;
```

**نقاط الفحص:**
- [ ] هل `_response_url` موجود في payload المرسل إلى Make.com؟
- [ ] هل Make.com يرسل POST request إلى الـ URL الصحيح؟
- [ ] هل الـ request body يحتوي على `execution_log_id` و `response_message`؟
- [ ] هل الرد يصل خلال المهلة المحددة؟
- [ ] هل توجد أخطاء في logs الـ `external-action-response-handler`?

#### المشكلة 3: رسالة Timeout لا تُرسل

**الأعراض:** السجل منتهي لكن العميل لم يستقبل رسالة

**التحقق:**
```sql
-- فحص سجلات الكرون
SELECT
  start_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'external-action-timeout-handler')
  AND status != 'succeeded'
ORDER BY start_time DESC
LIMIT 5;
```

**نقاط الفحص:**
- [ ] هل `EVOLUTION_API_KEY` مكون بشكل صحيح؟
- [ ] هل Instance Name صحيح في السجل؟
- [ ] فحص logs الـ `external-action-timeout-handler`

---

### 📝 ملخص التدفق الكامل

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. مستخدم يرسل رسالة عبر WhatsApp                                 │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│  2. smart-intent-analyzer يكتشف External Action                    │
│     - استخراج المتغيرات                                            │
│     - responseType = 'wait_for_webhook'                            │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│  3. external-action-executor ينفذ Webhook                          │
│     - إضافة _response_url و _execution_id إلى payload             │
│     - إرسال إلى Make.com/Zapier                                    │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│  4. direct/queue-processor ينشئ pending response                   │
│     INSERT INTO external_action_responses                          │
│     - response_received = false                                    │
│     - expires_at = now + timeout_seconds                           │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
                   ╔════════════════╗
                   ║  انتظار...    ║
                   ╚════════════════╝
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌──────────────────────┐              ┌──────────────────────┐
│  Make.com يرد خلال   │              │  Make.com لا يرد أو   │
│  المهلة (< 30s)     │              │  يتأخر (> 30s)       │
└──────────────────────┘              └──────────────────────┘
        ↓                                       ↓
┌──────────────────────┐              ┌──────────────────────┐
│  5A. external-       │              │  5B. Cron Job يكتشف │
│  action-response-    │              │  السجل المنتهي       │
│  handler يستقبل      │              │  (كل دقيقة)          │
│  الاستجابة           │              └──────────────────────┘
└──────────────────────┘                        ↓
        ↓                              ┌──────────────────────┐
┌──────────────────────┐              │  6B. إرسال رسالة     │
│  6A. إرسال رسالة     │              │  Timeout للعميل      │
│  الاستجابة للعميل   │              │  "عذراً، انتهت      │
│  عبر WhatsApp       │              │  مهلة الاستجابة"    │
└──────────────────────┘              └──────────────────────┘
        ↓                                       ↓
┌──────────────────────┐              ┌──────────────────────┐
│  7A. حفظ في          │              │  7B. حفظ في          │
│  المحادثة            │              │  المحادثة            │
└──────────────────────┘              └──────────────────────┘
        ↓                                       ↓
┌──────────────────────┐              ┌──────────────────────┐
│  8A. تحديث السجل:    │              │  8B. تحديث السجل:    │
│  response_received   │              │  response_received   │
│  = true              │              │  = true              │
│  response_message    │              │  response_message    │
│  = [من Make.com]     │              │  = 'TIMEOUT_EXPIRED' │
└──────────────────────┘              └──────────────────────┘
```

---

### ✅ قائمة التحقق النهائية

قبل الانتقال إلى Production:

- [ ] Migration `external_action_timeout_cron.sql` مُطبق
- [ ] إعدادات قاعدة البيانات مكونة (`supabase_url`, `service_role_key`)
- [ ] Edge function `external-action-timeout-handler` منشور
- [ ] Cron job نشط (`get_external_action_cron_status()` يعرض active = true)
- [ ] اختبار السيناريو A (استجابة ناجحة) ✅
- [ ] اختبار السيناريو B (timeout) ✅
- [ ] Make.com/Zapier مكون بشكل صحيح
- [ ] مراقبة الـ logs لأول 24 ساعة

---

### 🎯 نتيجة التحديثات

النظام الآن يدعم **جميع** أنواع الاستجابات الأربعة بشكل كامل:

| Response Type | إرسال رسالة | متى | يحتاج Callback |
|--------------|------------|-----|----------------|
| `none` | ❌ لا | - | ❌ لا |
| `simple_confirmation` | ✅ نعم | فوراً بعد webhook | ❌ لا |
| `custom_message` | ✅ نعم | فوراً بعد webhook | ❌ لا |
| `wait_for_webhook` | ✅ نعم | بعد رد الأتمتة أو timeout | ✅ نعم |

**ملاحظة مهمة:** جميع التعديلات تمت بحذر شديد بدون التأثير على الوظائف الحالية. فقط تمت إضافة منطق جديد للتعامل مع `wait_for_webhook`.

---

## 🔧 دليل إعداد Make.com لـ Wait for Webhook Response

### ⚠️ المشكلة الشائعة - Synchronous vs Asynchronous Response

**الخطأ الشائع:**
عندما يتلقى Make.com webhook من ConvGo، البعض يقوم بإرجاع response مباشرة في HTTP response body، مما يجعل النظام يعتقد أن هذا هو رد synchronous وليس asynchronous callback.

**النتيجة:**
- ✅ Webhook ينفذ بنجاح
- ✅ البيانات تُخزن في Google Sheets
- ❌ Make.com يُرجع رد في HTTP response بدلاً من استخدام callback URL
- ❌ النظام ينتظر 30 ثانية
- ❌ يرسل رسالة timeout للعميل

---

### ✅ الطريقة الصحيحة لإعداد Make.com

#### الخطوة 1: إنشاء Scenario جديد

1. افتح Make.com وأنشئ scenario جديد
2. أضف **Webhooks** module كـ Trigger
3. اختر **Custom webhook**
4. انسخ webhook URL وضعه في External Action في ConvGo

#### الخطوة 2: إضافة معالجة البيانات

أضف modules لمعالجة البيانات (مثل Google Sheets, Database, إلخ):

```
Webhook Trigger → Google Sheets: Add a row → HTTP: Make a request
```

**مثال - إضافة صف في Google Sheets:**

Module: **Google Sheets > Add a row**
- Spreadsheet: اختر الملف
- Sheet: اختر الورقة
- Values:
  - Name: `{{1.name}}` (من webhook payload)
  - Phone: `{{1.phone}}`
  - Timestamp: `{{1.timestamp}}`
  - Message: `{{1.message}}`

#### الخطوة 3: ⭐ **الخطوة الحرجة** - إرسال Callback Response

**⚠️ هام جداً:** لا تستخدم "Webhook Response" module - استخدم "HTTP Request" module

أضف module جديد:

Module: **HTTP > Make a request**

**الإعدادات:**
- **URL**: `{{1._response_url}}`
  - ⚠️ **مهم:** استخدم `_response_url` من webhook payload - لا تكتب URL يدوياً!
- **Method**: `POST`
- **Headers**:
  ```
  Content-Type: application/json
  ```
- **Body type**: `Raw`
- **Content type**: `JSON (application/json)`
- **Request content**:
  ```json
  {
    "execution_log_id": "{{1._execution_id}}",
    "response_message": "تم تسجيل طلبك برقم #12345 بنجاح ✅",
    "response_data": {
      "order_id": "12345",
      "status": "confirmed"
    }
  }
  ```

**شرح الحقول:**
- `execution_log_id` (مطلوب): استخدم `{{1._execution_id}}` من webhook payload
- `response_message` (مطلوب): الرسالة التي سترسل للعميل عبر WhatsApp
- `response_data` (اختياري): بيانات إضافية للتخزين

---

### 📋 مثال كامل لـ Scenario

```
┌─────────────────────────────────────────────────────────────┐
│ Module 1: Webhooks > Custom webhook                         │
│ - استقبال البيانات من ConvGo                               │
│ - يحتوي على: name, phone, _response_url, _execution_id    │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Module 2: Google Sheets > Add a row                         │
│ - تخزين البيانات في Google Sheets                          │
│ - Name: {{1.name}}                                          │
│ - Phone: {{1.phone}}                                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Module 3: Tools > Set variable (اختياري)                   │
│ - Variable name: rowNumber                                  │
│ - Variable value: {{2.rowNumber}}                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Module 4: HTTP > Make a request ⭐ (الخطوة الحرجة)          │
│ - URL: {{1._response_url}}                                  │
│ - Method: POST                                              │
│ - Body:                                                     │
│   {                                                         │
│     "execution_log_id": "{{1._execution_id}}",             │
│     "response_message": "تم التسجيل في السطر {{3.rowNumber}}"│
│   }                                                         │
└─────────────────────────────────────────────────────────────┘
```

---

### 🧪 اختبار التكوين

#### 1. اختبار Webhook في Make.com

1. في Make.com، انقر على **Run once**
2. أرسل رسالة WhatsApp تطابق External Action
3. تحقق من أن Make.com استقبل البيانات

#### 2. تحقق من Payload المستقبل

يجب أن ترى في Make.com:
```json
{
  "name": "عبدالرحيم",
  "phone": "201018090321",
  "message": "أريد حجز طلب",
  "timestamp": "2025-10-22T01:34:54.000Z",
  "_response_url": "https://xxxxx.supabase.co/functions/v1/external-action-response-handler",
  "_execution_id": "9e0b4e2e-cc35-433e-ba57-f4c277d6ec49"
}
```

⚠️ **تأكد من وجود:** `_response_url` و `_execution_id`

#### 3. اختبار HTTP Request Module

بعد تشغيل scenario:
1. افحص execution history في Make.com
2. تحقق من أن HTTP module أرسل request بنجاح
3. يجب أن ترى HTTP 200 response

#### 4. التحقق في ConvGo

افحص السجلات:
```sql
SELECT *
FROM external_action_responses
WHERE execution_log_id = '9e0b4e2e-cc35-433e-ba57-f4c277d6ec49';
```

يجب أن ترى:
- `response_received = true`
- `response_message` يحتوي على رسالتك
- `received_at` محدث

---

### ❌ الأخطاء الشائعة

#### خطأ 1: استخدام "Webhook Response" module

```
❌ خطأ: Webhooks > Webhook response
✅ صحيح: HTTP > Make a request
```

**السبب:** Webhook Response يُرجع رد في HTTP response مباشرة، وليس callback منفصل.

#### خطأ 2: كتابة URL يدوياً

```
❌ خطأ: URL = "https://xxxxx.supabase.co/functions/v1/external-action-response-handler"
✅ صحيح: URL = {{1._response_url}}
```

**السبب:** كل execution له `_response_url` فريد يتغير.

#### خطأ 3: نسيان `execution_log_id`

```json
❌ خطأ:
{
  "response_message": "تم بنجاح"
}

✅ صحيح:
{
  "execution_log_id": "{{1._execution_id}}",
  "response_message": "تم بنجاح"
}
```

**السبب:** النظام يحتاج `execution_log_id` للربط بين الـ request والـ response.

#### خطأ 4: تأخير كبير في الإرسال

```
❌ خطأ: إضافة Sleep module لـ 35 ثانية قبل HTTP request
✅ صحيح: إرسال فوري بعد المعالجة
```

**السبب:** Default timeout هو 30 ثانية.

---

### 🔍 استكشاف الأخطاء في Make.com

#### المشكلة: Make.com لا يستقبل webhook

**الحلول:**
1. تحقق من أن webhook URL صحيح في External Action
2. تأكد من أن scenario في وضع "Active"
3. افحص execution history في Make.com

#### المشكلة: HTTP request يفشل

**الحلول:**
```
1. تحقق من الـ URL:
   - يجب أن يكون {{1._response_url}}
   - لا تكتب URL يدوياً

2. تحقق من الـ Body:
   - يجب أن يكون JSON صحيح
   - يجب أن يحتوي على execution_log_id

3. افحص HTTP response:
   - HTTP 200: نجاح ✅
   - HTTP 400: مشكلة في request body
   - HTTP 404: execution_log_id غير موجود
   - HTTP 408: timeout exceeded
```

#### المشكلة: العميل يستقبل timeout message

**السبب المحتمل:**
- Make.com يستغرق أكثر من 30 ثانية
- HTTP request module غير موجود
- HTTP request يفشل

**الحلول:**
1. قلل وقت المعالجة في Make.com
2. تحقق من أن HTTP module موجود ويعمل
3. افحص execution history للأخطاء

---

### 📊 مثال تطبيقي - نظام حجز المواعيد

**السيناريو:** حجز موعد مع طبيب

**External Action في ConvGo:**
- Action Name: `book_appointment`
- Variables: `doctor_name`, `date`, `time`
- Response Type: `Wait for Automation Response`
- Timeout: 30 seconds

**Make.com Scenario:**

```
1. Webhook Trigger
   ↓
2. Google Calendar: Create an event
   - Title: "موعد مع {{1.doctor_name}}"
   - Start: {{1.date}} {{1.time}}
   - Duration: 30 minutes
   ↓
3. Router (اختياري):
   ├─ Path A: إذا نجح الحجز
   │  └─ HTTP Request:
   │     {
   │       "execution_log_id": "{{1._execution_id}}",
   │       "response_message": "✅ تم حجز موعدك مع {{1.doctor_name}} يوم {{1.date}} الساعة {{1.time}}"
   │     }
   │
   └─ Path B: إذا فشل الحجز
      └─ HTTP Request:
         {
           "execution_log_id": "{{1._execution_id}}",
           "response_message": "❌ عذراً، الموعد المطلوب محجوز بالفعل. يرجى اختيار موعد آخر."
         }
```

---

### ✅ قائمة التحقق النهائية

قبل تفعيل Scenario:

- [ ] Webhook URL صحيح في External Action
- [ ] Response Type في ConvGo = `Wait for Automation Response`
- [ ] Scenario في Make.com نشط (Active)
- [ ] استخدمت HTTP > Make a request (ليس Webhook Response)
- [ ] URL = `{{1._response_url}}` (ديناميكي)
- [ ] Body يحتوي على `execution_log_id` و `response_message`
- [ ] اختبرت scenario مرة واحدة على الأقل
- [ ] فحصت execution history في Make.com
- [ ] فحصت external_action_responses في Supabase

---

**ملاحظة نهائية:** إذا واجهت أي مشكلة، افحص:
1. Logs في Make.com (execution history)
2. Logs في Supabase (external-action-executor & external-action-response-handler)
3. جدول `external_action_responses` في قاعدة البيانات
