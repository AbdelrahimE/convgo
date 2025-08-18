-- Add missing intent categories: billing and general
-- Created for multi-tenant SaaS application with comprehensive keyword coverage

-- Insert Billing & Payments category
INSERT INTO intent_categories (
  user_id,
  category_key,
  display_name,
  description,
  keywords,
  example_phrases,
  classification_prompt,
  is_active,
  confidence_threshold,
  is_system_category,
  match_count,
  avg_confidence,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'billing_enhanced',
  'Billing & Payments (Enhanced)',
  'Comprehensive billing, payments, invoices, subscriptions, and financial inquiries with multi-industry support',
  '[
    "bill", "billing", "invoice", "invoices", "payment", "payments", "pay", "paid", "charge", "charged", "cost", "costs", "fee", "fees", "subscription", "subscriptions", "plan", "plans", "pricing", "price", "money", "amount", "refund", "refunds", "credit", "debit", "account", "balance", "transaction", "transactions", "receipt", "receipts", "statement", "statements", "financial", "finance", "due", "overdue", "renewal", "renew", "cancel", "cancellation", "upgrade", "downgrade", "discount", "promo", "coupon", "voucher", "tax", "taxes", "vat", "currency", "dollar", "euro", "pound", "installment", "installments", "autopay", "auto-pay", "paypal", "stripe", "visa", "mastercard", "amex", "bank", "banking", "wire", "transfer", "billing_address", "payment_method", "card", "credit_card", "debit_card", "expired", "decline", "declined", "failed", "error",
    "فاتورة", "فواتير", "فوترة", "دفع", "دفعة", "دفعات", "مدفوع", "سدد", "سداد", "تسديد", "دفعت", "بلغ", "مبلغ", "مبالغ", "تكلفة", "تكاليف", "كلفة", "رسوم", "رسم", "اشتراك", "اشتراكات", "باقة", "باقات", "خطة", "خطط", "سعر", "أسعار", "تسعير", "تسعيرة", "فلوس", "مال", "أموال", "استرداد", "استرد", "مردود", "ائتمان", "خصم", "حساب", "حسابي", "رصيد", "معاملة", "معاملات", "إيصال", "إيصالات", "كشف", "كشوف", "مالي", "مالية", "مستحق", "متأخر", "تجديد", "جدد", "إلغاء", "ألغي", "ترقية", "تخفيض", "خصم", "كوبون", "قسيمة", "ضريبة", "ضرائب", "قسط", "أقساط", "دفع_تلقائي", "بايبال", "فيزا", "ماستركارد", "بنك", "مصرف", "تحويل", "حوالة", "عنوان_الفوترة", "طريقة_الدفع", "بطاقة", "بطاقة_ائتمان", "منتهي", "مرفوض", "فشل", "خطأ",
    "حساب", "حسابات", "محاسبة", "محاسبي", "مالي", "مدفوعات", "مستحقات", "ديون", "دين", "مديون", "دائن", "قيمة", "قيم", "مصاريف", "مصروف", "إنفاق", "صرف", "صرفت", "كلف", "كلفني", "كام", "بكام", "بكم", "ثمن", "أثمان", "غالي", "رخيص", "مجاني", "ببلاش", "مدين", "مديونية", "سلفة", "قرض", "تمويل", "ممول", "ناقص", "زائد", "باقي", "متبقي", "ادفع", "ادفعلك", "هدفع", "هسدد", "محتاج_أدفع", "عايز_ادفع", "بدي_ادفع", "ابي_ادفع"
  ]',
  '[
    "How much do I owe?", "What is my current balance?", "I need to update my payment method", "My card was declined", "When is my next payment due?", "Can I get a refund?", "I want to cancel my subscription", "How can I upgrade my plan?", "I did not receive my invoice", "There is an error on my bill", "Can I pay in installments?", "What payment methods do you accept?", "I need a receipt for my payment", "My subscription auto-renewed but I want to cancel", "Why was I charged twice?", "I want to change my billing address", "Can I get a discount?", "What is included in this plan?", "How do I download my invoice?", "My payment failed, what should I do?",
    "كم المبلغ المطلوب؟", "ايش رصيدي الحالي؟", "محتاج أحدث طريقة الدفع", "البطاقة اترفضت", "امتى موعد الدفعة الجاية؟", "ممكن استرد فلوسي؟", "عايز ألغي الاشتراك", "ازاي أرقي الباقة؟", "مجتنيش الفاتورة", "فيه غلطة في الفاتورة", "ممكن ادفع على أقساط؟", "ايه طرق الدفع المتاحة؟", "محتاج إيصال للدفعة", "الاشتراك اتجدد تلقائي وأنا عايز ألغيه", "ليه اتخصم مني مرتين؟", "عايز أغير عنوان الفوترة", "ممكن خصم؟", "ايه اللي موجود في الباقة دي؟", "ازاي أنزل الفاتورة؟", "الدفع فشل، أعمل ايه؟",
    "بكم الاشتراك؟", "كم سعر الخدمة؟", "متى ينتهي اشتراكي؟", "أريد إيقاف الخصم التلقائي", "لم يتم خصم المبلغ", "هل يمكنني تأجيل الدفع؟", "أريد تغيير الباقة", "كيف أدفع بالتقسيط؟", "ما هي رسوم التجديد؟", "أريد فاتورة ضريبية", "هل توجد عروض أو خصومات؟", "كيف أحصل على استرداد؟", "لماذا تم رفض دفعتي؟", "أريد تحديث بيانات البطاقة", "متى سيتم تجديد اشتراكي؟"
  ]',
  'This message appears to be a billing or payment inquiry. Look for keywords related to payments, invoices, subscriptions, charges, refunds, or financial matters. Pay attention to terms like "pay", "bill", "charge", "refund", "subscription", "invoice" in English, and "دفع", "فاتورة", "حساب", "اشتراك", "رصيد", "استرداد" in Arabic. Also watch for specific amounts, currency mentions, or payment method references.',
  true,
  0.45,
  true,
  0,
  '0.00',
  '2025-08-17 12:00:00.000000+00',
  '2025-08-17 12:00:00.000000+00'
);

-- Insert General Information category  
INSERT INTO intent_categories (
  user_id,
  category_key,
  display_name,
  description,
  keywords,
  example_phrases,
  classification_prompt,
  is_active,
  confidence_threshold,
  is_system_category,
  match_count,
  avg_confidence,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'general_enhanced',
  'General Information (Enhanced)',
  'General inquiries, greetings, basic information, company details, and casual conversations across all industries',
  '[
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening", "greetings", "how are you", "thanks", "thank you", "please", "welcome", "goodbye", "bye", "see you", "nice", "great", "awesome", "excellent", "ok", "okay", "yes", "no", "maybe", "sure", "of course", "information", "info", "about", "who", "what", "when", "where", "why", "how", "tell me", "explain", "describe", "details", "company", "business", "organization", "team", "staff", "contact", "address", "location", "phone", "email", "website", "hours", "schedule", "time", "open", "closed", "available", "working", "office", "branch", "headquarters", "general", "basic", "simple", "easy", "help", "assist", "guide", "tutorial", "introduction", "overview", "summary", "learn", "understand", "know", "aware", "question", "answer", "faq", "frequently", "common", "typical", "usual", "normal", "standard", "regular", "policy", "policies", "terms", "conditions", "rules", "guidelines", "procedure", "process", "method", "way", "approach", "strategy", "plan", "goal", "objective", "mission", "vision", "values",
    "السلام عليكم", "أهلا", "مرحبا", "هاي", "هلو", "صباح الخير", "مساء الخير", "تحية", "كيف الحال", "كيف حالك", "كيفك", "ازيك", "شكرا", "شكرا لك", "شكرا جزيلا", "متشكر", "من فضلك", "لو سمحت", "أهلا وسهلا", "مع السلامة", "باي", "وداعا", "إلى اللقاء", "نشوفك", "حلو", "رائع", "ممتاز", "عظيم", "جميل", "طيب", "تمام", "ماشي", "اوكي", "موافق", "أيوة", "نعم", "لا", "ممكن", "أكيد", "طبعا", "بالطبع", "معلومات", "معلومة", "عن", "حول", "بخصوص", "مين", "إيه", "ايش", "شو", "امتى", "متى", "وين", "فين", "ليه", "لماذا", "كيف", "ازاي", "قولي", "قوللي", "اشرحلي", "وضحلي", "فهمني", "تفاصيل", "شركة", "مؤسسة", "منظمة", "فريق", "طاقم", "موظفين", "تواصل", "اتصال", "عنوان", "مكان", "موقع", "تليفون", "ايميل", "موقع_الكتروني", "ساعات", "مواعيد", "وقت", "مفتوح", "مقفول", "متاح", "شغال", "مكتب", "فرع", "مقر", "عام", "عامة", "بسيط", "سهل", "مساعدة", "ساعدني", "دليل", "شرح", "مقدمة", "ملخص", "اتعلم", "أفهم", "أعرف", "سؤال", "جواب", "إجابة", "أسئلة_شائعة", "عادي", "طبيعي", "معتاد", "سياسة", "شروط", "أحكام", "قوانين", "إرشادات", "إجراءات", "طريقة", "أسلوب", "خطة", "هدف", "رسالة", "رؤية", "قيم",
    "معلش", "عذرا", "اسف", "آسف", "مش فاهم", "مفهمتش", "ممكن توضح", "ممكن تعيد", "مش عارف", "محتار", "مش متأكد", "يعني ايه", "قصدك ايه", "ممكن مثال", "يعني", "أقصد", "بمعنى", "بالمناسبة", "حاضر", "خلاص", "كده", "كفاية", "بس", "إزاي أقدر", "ممكن أعرف", "عايز أفهم", "محتاج أعرف", "إيه رأيك", "ايش تنصحني", "شو تقترح", "أفضل حاجة", "إيه الأحسن", "مين المسؤول", "مع مين أتكلم", "فين أروح", "ازاي أوصل", "امتى أجي", "هل متأكد", "تقدر تساعدني", "ممكن خدمة", "عندكم ايه", "إيه الجديد", "فيه إيه", "حصل إيه", "ايش الأخبار", "كل حاجة تمام", "كله كويس", "مفيش مشاكل"
  ]',
  '[
    "Hello, how are you today?", "Can you tell me about your company?", "What services do you offer?", "Where are you located?", "What are your business hours?", "How can I contact you?", "Thank you for your help", "Have a great day!", "Nice to meet you", "I have a general question", "Can you help me understand your business?", "What is your company about?", "I am new here, can you guide me?", "Good morning, I hope you are well", "Is anyone available to chat?", "I just wanted to say hello", "How long have you been in business?", "What makes your company special?", "Can you provide more information?", "I am interested in learning more",
    "السلام عليكم، كيف الحال؟", "ممكن تحكيلي عن شركتكم؟", "ايه الخدمات اللي بتقدموها؟", "فين مكانكم؟", "ايه مواعيد العمل؟", "ازاي أقدر أتواصل معاكم؟", "شكرا على المساعدة", "يوم سعيد!", "فرصة سعيدة", "عندي سؤال عام", "ممكن تساعدني أفهم شغلكم؟", "شركتكم بتشتغل في ايه؟", "أنا جديد هنا، ممكن ترشدني؟", "صباح الخير، اتمنى تكونوا بخير", "فيه حد متاح يتكلم؟", "بس حبيت أسلم", "من امتى وانتم شغالين؟", "ايه اللي يميز شركتكم؟", "ممكن معلومات أكتر؟", "مهتم أعرف أكتر",
    "مرحبا، كيف يمكنني مساعدتك؟", "أهلا وسهلا بك", "كيف حالك اليوم؟", "ما هي قصة شركتكم؟", "كم سنة لكم في السوق؟", "ما هي رؤية الشركة؟", "أين يقع مقركم الرئيسي؟", "هل لديكم فروع أخرى؟", "ما هي ساعات العمل؟", "كيف يمكنني التواصل معكم؟", "هل يمكنني زيارتكم؟", "متى تم تأسيس الشركة؟", "من هو المدير العام؟", "كم عدد الموظفين لديكم؟", "ما هي تخصصاتكم؟", "في أي المجالات تعملون؟", "هل لديكم موقع إلكتروني؟", "كيف أحصل على معلومات أكثر؟", "شكرا لكم على التواصل", "أتطلع للعمل معكم"
  ]',
  'This message appears to be a general inquiry or casual conversation. Look for greetings, general questions about the company or services, basic information requests, casual conversation, or messages that do not fit into specific categories like sales, technical support, or billing. Common indicators include words like "hello", "about", "information", "company", "general" in English, and "مرحبا", "معلومات", "شركة", "عام", "سؤال" in Arabic.',
  true,
  0.30,
  true,
  0,
  '0.00',
  '2025-08-17 12:00:00.000000+00',
  '2025-08-17 12:00:00.000000+00'
);