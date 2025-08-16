#!/usr/bin/env node

/**
 * اختبار شامل للنظام النهائي بعد حذف النظام القديم
 * يتأكد من أن النظام الذكي الجديد يعمل بكفاءة 100%
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const testCases = [
  {
    name: 'اختبار المبيعات - مصري',
    message: 'ازيك يريس عندي استفسار بسيط عن اشتراكات المنصة',
    expectedIntent: 'sales',
    minConfidence: 0.85
  },
  {
    name: 'اختبار الدعم التقني - مصري',  
    message: 'فيه مشكلة في اللايف شات مش بيبعت الصور وبيبعت النصوص بس',
    expectedIntent: 'technical',
    minConfidence: 0.85
  },
  {
    name: 'اختبار المدفوعات - خليجي',
    message: 'عندي مشكلة في الفاتورة ماقدر أدفع',
    expectedIntent: 'billing',
    minConfidence: 0.80
  },
  {
    name: 'اختبار مختلط عربي-إنجليزي',
    message: 'Hello أريد أعرف pricing للباقات المختلفة please',
    expectedIntent: 'sales', 
    minConfidence: 0.75
  },
  {
    name: 'اختبار شامي',
    message: 'مرحبا، بدي أعرف شو المشاكل بالنظام اليوم؟',
    expectedIntent: 'technical',
    minConfidence: 0.80
  }
];

async function runTest(testCase, instanceId, userId) {
  try {
    console.log(`\n🧪 تشغيل: ${testCase.name}`);
    console.log(`📝 الرسالة: "${testCase.message}"`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/smart-intent-analyzer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: testCase.message,
        whatsappInstanceId: instanceId,
        userId: userId,
        conversationHistory: ['مرحبا', 'أهلاً وسهلاً']
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    
    console.log(`🎯 النية المكتشفة: ${result.intent} (ثقة: ${result.confidence.toFixed(3)})`);
    console.log(`🏢 نوع العمل: ${result.businessContext?.industry || 'غير محدد'}`);
    console.log(`💬 أسلوب التواصل: ${result.businessContext?.communicationStyle || 'غير محدد'}`);
    console.log(`🤖 الشخصية: ${result.selectedPersonality ? 'تم العثور عليها ✅' : 'لم توجد ❌'}`);
    console.log(`⏱️ وقت المعالجة: ${result.processingTimeMs}ms`);
    
    // التحقق من النتائج
    const intentMatch = result.intent === testCase.expectedIntent;
    const confidenceOk = result.confidence >= testCase.minConfidence;
    const hasPersonality = !!result.selectedPersonality;
    
    console.log(`\n📊 النتائج:`);
    console.log(`   النية ${intentMatch ? '✅' : '❌'} (متوقع: ${testCase.expectedIntent})`);
    console.log(`   الثقة ${confidenceOk ? '✅' : '❌'} (الحد الأدنى: ${testCase.minConfidence})`);
    console.log(`   الشخصية ${hasPersonality ? '✅' : '⚠️'}`);
    
    return {
      name: testCase.name,
      success: intentMatch && confidenceOk,
      details: result,
      issues: [
        ...(!intentMatch ? [`النية خاطئة: ${result.intent} بدلاً من ${testCase.expectedIntent}`] : []),
        ...(!confidenceOk ? [`ثقة منخفضة: ${result.confidence.toFixed(3)} < ${testCase.minConfidence}`] : []),
        ...(!hasPersonality ? ['لا توجد شخصية مطابقة'] : [])
      ]
    };
    
  } catch (error) {
    console.error(`❌ خطأ في الاختبار: ${error.message}`);
    return {
      name: testCase.name,
      success: false,
      error: error.message,
      issues: ['فشل تام في الاختبار']
    };
  }
}

async function runAllTests() {
  console.log('🚀 بدء الاختبار الشامل للنظام النهائي\n');
  console.log('=' .repeat(60));
  
  // معرفات الاختبار (استبدلها بقيمك الحقيقية)
  const testInstanceId = process.env.TEST_INSTANCE_ID || 'your-test-instance-id';
  const testUserId = process.env.TEST_USER_ID || 'your-test-user-id';
  
  const results = [];
  
  for (const testCase of testCases) {
    const result = await runTest(testCase, testInstanceId, testUserId);
    results.push(result);
    
    // انتظار قصير بين الاختبارات
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // تلخيص النتائج
  console.log('\n' + '=' .repeat(60));
  console.log('📋 ملخص النتائج النهائية:');
  console.log('=' .repeat(60));
  
  const successful = results.filter(r => r.success).length;
  const total = results.length;
  const successRate = ((successful / total) * 100).toFixed(1);
  
  console.log(`\n🎯 معدل النجاح: ${successful}/${total} (${successRate}%)`);
  
  if (successful === total) {
    console.log('🎉 تهانينا! جميع الاختبارات نجحت - النظام جاهز للإنتاج');
  } else {
    console.log('\n⚠️  الاختبارات الفاشلة:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`\n❌ ${result.name}:`);
      result.issues?.forEach(issue => console.log(`   - ${issue}`));
      if (result.error) {
        console.log(`   خطأ: ${result.error}`);
      }
    });
  }
  
  // إحصائيات متقدمة
  console.log('\n📈 إحصائيات متقدمة:');
  const confidences = results.filter(r => r.details?.confidence).map(r => r.details.confidence);
  if (confidences.length > 0) {
    const avgConfidence = (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3);
    const minConfidence = Math.min(...confidences).toFixed(3);
    const maxConfidence = Math.max(...confidences).toFixed(3);
    
    console.log(`   متوسط الثقة: ${avgConfidence}`);
    console.log(`   أقل ثقة: ${minConfidence}`);
    console.log(`   أعلى ثقة: ${maxConfidence}`);
  }
  
  const processingTimes = results.filter(r => r.details?.processingTimeMs).map(r => r.details.processingTimeMs);
  if (processingTimes.length > 0) {
    const avgTime = Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length);
    const minTime = Math.min(...processingTimes);
    const maxTime = Math.max(...processingTimes);
    
    console.log(`   متوسط وقت المعالجة: ${avgTime}ms`);
    console.log(`   أسرع معالجة: ${minTime}ms`);
    console.log(`   أبطأ معالجة: ${maxTime}ms`);
  }
  
  console.log('\n' + '=' .repeat(60));
  
  process.exit(successful === total ? 0 : 1);
}

// التحقق من المتطلبات
if (!SERVICE_KEY) {
  console.error('❌ يجب تعيين SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة');
  process.exit(1);
}

// تشغيل الاختبارات
runAllTests().catch(error => {
  console.error('❌ خطأ عام في الاختبار:', error);
  process.exit(1);
});