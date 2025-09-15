# 💼 External Actions V2 - Real-World Use Cases & Examples

## 🏥 **Use Case 1: عيادة طبية - حجز المواعيد**

### **السيناريو:**
المريض يرسل رسالة لحجز موعد، النظام يتحقق من التوافر ويحجز ويرسل التفاصيل.

### **Configuration:**
```json
{
  "action_name": "book_appointment",
  "display_name": "حجز موعد طبي",
  "response_type": "wait_for_webhook",
  "response_timeout_seconds": 45,
  "training_examples": [
    "أريد حجز موعد",
    "هل يمكنني حجز موعد مع الدكتور",
    "أحتاج موعد للكشف"
  ],
  "variable_prompts": {
    "preferred_date": "ما هو التاريخ المفضل للموعد؟",
    "specialty": "ما هو التخصص المطلوب؟"
  }
}
```

### **Flow:**
```
1. Patient: "أريد حجز موعد مع دكتور قلب يوم الأحد"
2. System → Make.com: {specialty: "قلب", preferred_date: "الأحد"}
3. Make.com: 
   - Checks calendar API
   - Finds available slot
   - Creates appointment
   - Sends response back
4. System → Patient: "✅ تم حجز موعدك:
   - الطبيب: د. أحمد محمد (قلب)
   - التاريخ: الأحد 20/1/2025
   - الوقت: 3:00 مساءً
   - العنوان: العيادة الرئيسية، الدور الثالث
   - رقم الحجز: #A2345"
```

---

## 🍔 **Use Case 2: مطعم - طلبات التوصيل**

### **السيناريو:**
العميل يطلب وجبة، النظام يسجل الطلب ويرسل رقم الطلب ووقت التوصيل المتوقع.

### **Configuration:**
```json
{
  "action_name": "food_order",
  "display_name": "طلب وجبة",
  "response_type": "custom_message",
  "confirmation_message": "شكراً {name}! 🍔\nطلبك: {items}\nالإجمالي: {total} جنيه\nسيصلك خلال 30-45 دقيقة\nرقم الطلب: #{order_id}",
  "training_examples": [
    "أريد طلب برجر",
    "عايز أطلب أكل",
    "ممكن منيو وأطلب"
  ]
}
```

### **Flow:**
```
1. Customer: "أريد برجر دجاج كبير مع بطاطس"
2. System extracts: {items: "برجر دجاج كبير + بطاطس"}
3. Zapier creates order → Returns: {order_id: "F789", total: "85"}
4. System → Customer: "شكراً محمد! 🍔
   طلبك: برجر دجاج كبير + بطاطس
   الإجمالي: 85 جنيه
   سيصلك خلال 30-45 دقيقة
   رقم الطلب: #F789"
```

---

## 🏦 **Use Case 3: بنك - الاستعلام عن الرصيد**

### **السيناريو:**
العميل يستعلم عن رصيده، النظام يتحقق من الهوية ويرسل الرصيد بشكل آمن.

### **Configuration:**
```json
{
  "action_name": "check_balance",
  "display_name": "الاستعلام عن الرصيد",
  "response_type": "wait_for_webhook",
  "response_timeout_seconds": 20,
  "training_examples": [
    "كم رصيدي",
    "أريد معرفة الرصيد",
    "الاستعلام عن حسابي"
  ],
  "variable_prompts": {
    "account_last_4": "آخر 4 أرقام من رقم الحساب؟",
    "pin": "الرقم السري المؤقت المرسل لك؟"
  }
}
```

### **Flow:**
```
1. Customer: "أريد معرفة رصيدي، آخر 4 أرقام 1234"
2. System → n8n: {phone: "01012345678", account_last_4: "1234"}
3. n8n:
   - Verifies identity
   - Sends OTP via SMS
   - Waits for confirmation
   - Returns balance
4. System → Customer: "رصيدك الحالي: 15,750 جنيه
   آخر عملية: سحب 500 جنيه (أمس)
   الرصيد المتاح: 15,750 جنيه"
```

---

## 🛍️ **Use Case 4: متجر إلكتروني - تتبع الطلبات**

### **السيناريو:**
العميل يسأل عن حالة طلبه، النظام يستعلم ويرسل التفاصيل.

### **Configuration:**
```json
{
  "action_name": "track_order",
  "display_name": "تتبع الطلب",
  "response_type": "wait_for_webhook",
  "response_timeout_seconds": 15,
  "training_examples": [
    "أين طلبي",
    "متى يصل الطلب",
    "أريد تتبع الشحنة"
  ]
}
```

### **Flow:**
```
1. Customer: "أين طلبي رقم 88776؟"
2. System → Make.com: {order_number: "88776", phone: "01098765432"}
3. Make.com queries shipping API
4. System → Customer: "📦 حالة طلبك #88776:
   الحالة: في الطريق 🚚
   الموقع الحالي: مركز التوزيع - القاهرة
   التسليم المتوقع: اليوم بين 2-5 مساءً
   المندوب: أحمد علي (01234567890)"
```

---

## 🏢 **Use Case 5: شركة عقارات - جدولة معاينات**

### **السيناريو:**
العميل يريد معاينة عقار، النظام يحجز موعد المعاينة.

### **Configuration:**
```json
{
  "action_name": "schedule_viewing",
  "display_name": "جدولة معاينة عقار",
  "response_type": "wait_for_webhook",
  "training_examples": [
    "أريد معاينة الشقة",
    "متى يمكنني زيارة العقار",
    "أحجز معاينة"
  ],
  "variable_prompts": {
    "property_id": "رقم العقار المطلوب معاينته؟",
    "preferred_time": "الوقت المفضل للمعاينة؟"
  }
}
```

---

## 📊 **Use Case 6: مركز تدريب - التسجيل في الدورات**

### **السيناريو:**
الطالب يسجل في دورة تدريبية.

### **Configuration:**
```json
{
  "action_name": "course_registration",
  "display_name": "التسجيل في دورة",
  "response_type": "custom_message",
  "confirmation_message": "✅ تم تسجيلك في دورة {course_name}\n📅 تبدأ: {start_date}\n💰 الرسوم: {price} جنيه\n📧 تم إرسال التفاصيل على {email}",
  "training_examples": [
    "أريد التسجيل في دورة",
    "كيف أسجل في الكورس",
    "التحاق بالدورة التدريبية"
  ]
}
```

---

## 🚗 **Use Case 7: تأجير السيارات - الحجز الفوري**

### **Configuration:**
```json
{
  "action_name": "rent_car",
  "display_name": "تأجير سيارة",
  "response_type": "wait_for_webhook",
  "response_timeout_seconds": 60,
  "variable_prompts": {
    "car_type": "نوع السيارة المطلوبة؟",
    "pickup_date": "تاريخ الاستلام؟",
    "duration_days": "عدد أيام الإيجار؟"
  }
}
```

---

## 📱 **Use Case 8: شركة اتصالات - شحن الرصيد**

### **Configuration:**
```json
{
  "action_name": "recharge_credit",
  "display_name": "شحن رصيد",
  "response_type": "simple_confirmation",
  "confirmation_message": "✅ تم شحن رصيدك بنجاح\nالمبلغ: {amount} جنيه\nالرصيد الحالي: {new_balance} جنيه",
  "training_examples": [
    "أريد شحن رصيد",
    "اشحن لي 50 جنيه",
    "عايز أشحن الخط"
  ]
}
```

---

## 🎯 **Response Type Selection Guide**

### **Use `none` when:**
- Just logging/saving data
- No user confirmation needed
- Silent operations

### **Use `simple_confirmation` when:**
- Fixed acknowledgment message
- No dynamic data needed
- Quick confirmation

### **Use `custom_message` when:**
- Need to include extracted variables
- Personalized messages
- Multi-language support

### **Use `wait_for_webhook` when:**
- Need data from external systems
- Complex operations (bookings, queries)
- Real-time information required
- Multi-step processes

---

## 🔧 **Integration Examples for Automation Platforms**

### **Make.com Scenario:**
```javascript
// Webhook receives data
const data = webhook.data;

// Process business logic
const result = processOrder(data);

// Send response back
http.post(data._response_url, {
  execution_log_id: data._execution_id,
  response_message: `طلبك رقم ${result.order_id} تم بنجاح`,
  response_data: result
});
```

### **Zapier Webhook Response:**
```python
# In Zapier Code Step
import requests

response_url = input_data['_response_url']
execution_id = input_data['_execution_id']

# After processing
response = requests.post(response_url, json={
    'execution_log_id': execution_id,
    'response_message': f"تم الحجز برقم {booking_id}",
    'response_data': {'booking_id': booking_id}
})
```

### **n8n Workflow:**
```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook"
    },
    {
      "name": "Process",
      "type": "n8n-nodes-base.function"
    },
    {
      "name": "Send Response",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{$node['Webhook'].json['_response_url']}}",
        "method": "POST",
        "body": {
          "execution_log_id": "={{$node['Webhook'].json['_execution_id']}}",
          "response_message": "تمت العملية بنجاح"
        }
      }
    }
  ]
}
```

---

## 📈 **Business Benefits**

| Benefit | Impact | Example |
|---------|--------|---------|
| **Automation** | -80% manual work | Auto-booking appointments |
| **Response Time** | <30 seconds | Instant order confirmation |
| **Customer Satisfaction** | +40% | Personalized responses |
| **Scalability** | Unlimited actions | Any business process |
| **Integration** | Any platform | Make, Zapier, n8n, custom |

---

## 🎉 **Success Stories Potential**

### **🏥 Medical Clinic:**
"Reduced appointment booking time from 5 minutes to 30 seconds"

### **🍔 Restaurant:**
"Increased orders by 35% with instant WhatsApp ordering"

### **🏦 Bank:**
"Handled 10,000+ balance inquiries daily without human intervention"

### **🛍️ E-commerce:**
"Real-time order tracking increased customer satisfaction by 45%"

---

## 💡 **Pro Tips**

1. **Start Simple:** Begin with `simple_confirmation`, then upgrade
2. **Test Timeouts:** Set realistic timeouts for your automation
3. **Use Templates:** Create reusable message templates
4. **Monitor Logs:** Track success rates and optimize
5. **Fallback Messages:** Always have error handling
6. **Language Support:** Offer multi-language responses
7. **Variable Validation:** Ensure all variables are extracted correctly
8. **Security:** Never expose sensitive data in messages