import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, TestTube, Play, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import logger from '@/utils/logger';

interface TestResult {
  message: string;
  decision: string;
  confidence: number;
  reasoning: string;
  urgencyLevel: string;
  emotionalState: string;
  canSolveWithRAG: boolean;
  processingTime: number;
  success: boolean;
}

interface SmartEscalationTestingProps {
  instanceId: string;
}

const testScenarios = [
  {
    id: 'technical_issue',
    title: 'مشكلة تقنية',
    message: 'لا أستطيع الدخول إلى حسابي، يظهر خطأ 500',
    expectedDecision: 'escalate_immediate',
    description: 'مشكلة تقنية تتطلب تدخل بشري'
  },
  {
    id: 'general_inquiry',
    title: 'استفسار عام',
    message: 'ما هي ساعات العمل؟',
    expectedDecision: 'solve_with_ai',
    description: 'سؤال بسيط يمكن للذكاء الاصطناعي الإجابة عليه'
  },
  {
    id: 'angry_customer',
    title: 'عميل غاضب',
    message: 'هذا غير مقبول! أريد إلغاء الخدمة فوراً ولن أدفع أي شيء!',
    expectedDecision: 'escalate_immediate',
    description: 'عميل غاضب بمشاعر سلبية قوية'
  },
  {
    id: 'product_inquiry',
    title: 'استفسار عن منتج',
    message: 'أريد معرفة المزيد عن خطة Premium والأسعار',
    expectedDecision: 'solve_with_ai',
    description: 'استفسار عن منتج يمكن الإجابة عليه من قاعدة المعرفة'
  },
  {
    id: 'billing_issue',
    title: 'مشكلة في الفاتورة',
    message: 'تم خصم مبلغ خطأ من حسابي، أحتاج مساعدة عاجلة',
    expectedDecision: 'escalate_with_context',
    description: 'مشكلة مالية تتطلب مراجعة بشرية'
  }
];

export const SmartEscalationTesting = ({ instanceId }: SmartEscalationTestingProps) => {
  const { user } = useAuth();
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [isTestingCustom, setIsTestingCustom] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);

  const testSmartEscalation = async (message: string): Promise<TestResult> => {
    const startTime = Date.now();
    
    try {
      // Call the smart escalation analyzer
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/smart-intent-analyzer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabase.supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          whatsappInstanceId: instanceId,
          userId: user?.id,
          conversationHistory: []
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;

      // Simulate escalation decision based on intent and emotion analysis
      let decision = 'solve_with_ai';
      
      if (result.emotionAnalysis?.urgency_detected && 
          result.emotionAnalysis?.sentiment_score < -0.5) {
        decision = 'escalate_immediate';
      } else if (result.intent === 'technical' && result.confidence < 0.7) {
        decision = 'escalate_with_context';
      } else if (result.emotionAnalysis?.primary_emotion === 'angry' ||
                result.emotionAnalysis?.primary_emotion === 'frustrated') {
        decision = 'escalate_immediate';
      }

      return {
        message,
        decision,
        confidence: result.confidence,
        reasoning: result.reasoning || 'تحليل ذكي للرسالة',
        urgencyLevel: result.emotionAnalysis?.urgency_detected ? 'high' : 'medium',
        emotionalState: result.emotionAnalysis?.emotional_state || 'neutral',
        canSolveWithRAG: result.confidence > 0.6,
        processingTime,
        success: true
      };
    } catch (error) {
      logger.error('Error testing smart escalation:', error);
      return {
        message,
        decision: 'error',
        confidence: 0,
        reasoning: `خطأ في الاختبار: ${error}`,
        urgencyLevel: 'unknown',
        emotionalState: 'error',
        canSolveWithRAG: false,
        processingTime: Date.now() - startTime,
        success: false
      };
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);
    setCurrentTestIndex(0);

    const results: TestResult[] = [];
    
    for (let i = 0; i < testScenarios.length; i++) {
      setCurrentTestIndex(i);
      const scenario = testScenarios[i];
      
      toast.info(`اختبار: ${scenario.title}`);
      
      const result = await testSmartEscalation(scenario.message);
      results.push(result);
      setTestResults([...results]);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsRunningTests(false);
    setCurrentTestIndex(0);
    
    const successCount = results.filter(r => r.success).length;
    if (successCount === results.length) {
      toast.success(`تم إكمال جميع الاختبارات بنجاح (${successCount}/${results.length})`);
    } else {
      toast.warning(`تم إكمال الاختبارات: ${successCount}/${results.length} ناجحة`);
    }
  };

  const testCustomMessage = async () => {
    if (!customMessage.trim()) {
      toast.error('يرجى إدخال رسالة للاختبار');
      return;
    }

    setIsTestingCustom(true);
    
    try {
      const result = await testSmartEscalation(customMessage);
      setTestResults([result]);
      
      if (result.success) {
        toast.success('تم اختبار الرسالة بنجاح');
      } else {
        toast.error('فشل في اختبار الرسالة');
      }
    } catch (error) {
      toast.error('خطأ في اختبار الرسالة');
    } finally {
      setIsTestingCustom(false);
    }
  };

  const getDecisionBadgeColor = (decision: string) => {
    switch (decision) {
      case 'escalate_immediate':
        return 'destructive';
      case 'escalate_with_context':
        return 'default';
      case 'solve_with_ai':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'escalate_immediate':
        return <XCircle className="h-4 w-4" />;
      case 'escalate_with_context':
        return <AlertCircle className="h-4 w-4" />;
      case 'solve_with_ai':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };

  const getDecisionText = (decision: string) => {
    switch (decision) {
      case 'escalate_immediate':
        return 'تصعيد فوري';
      case 'escalate_with_context':
        return 'تصعيد مع السياق';
      case 'solve_with_ai':
        return 'حل بالذكاء الاصطناعي';
      case 'error':
        return 'خطأ';
      default:
        return 'غير محدد';
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TestTube className="h-5 w-5 mr-2" />
            اختبار النظام الذكي للتصعيد
          </CardTitle>
          <CardDescription>
            قم بتشغيل اختبارات مختلفة لتقييم أداء نظام التصعيد الذكي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Automated Tests */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">الاختبارات التلقائية</h3>
              <Button
                onClick={runAllTests}
                disabled={isRunningTests}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isRunningTests ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    اختبار {currentTestIndex + 1}/{testScenarios.length}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    تشغيل جميع الاختبارات
                  </>
                )}
              </Button>
            </div>

            {isRunningTests && (
              <div className="space-y-2">
                <Progress value={(currentTestIndex / testScenarios.length) * 100} />
                <p className="text-sm text-muted-foreground text-center">
                  {currentTestIndex > 0 && `جاري اختبار: ${testScenarios[currentTestIndex]?.title}`}
                </p>
              </div>
            )}
          </div>

          {/* Custom Message Test */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">اختبار رسالة مخصصة</h3>
            <div className="space-y-2">
              <Label>الرسالة المراد اختبارها</Label>
              <LanguageAwareTextarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="اكتب رسالة لاختبار كيفية تعامل النظام الذكي معها..."
                rows={3}
              />
            </div>
            <Button
              onClick={testCustomMessage}
              disabled={isTestingCustom || !customMessage.trim()}
              variant="outline"
            >
              {isTestingCustom ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الاختبار...
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  اختبار الرسالة
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>نتائج الاختبارات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{result.message}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={getDecisionBadgeColor(result.decision)}>
                        {getDecisionIcon(result.decision)}
                        <span className="mr-1">{getDecisionText(result.decision)}</span>
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">الثقة:</span>
                      <span className="ml-1">{Math.round(result.confidence * 100)}%</span>
                    </div>
                    <div>
                      <span className="font-medium">الاستعجال:</span>
                      <span className="ml-1">{result.urgencyLevel}</span>
                    </div>
                    <div>
                      <span className="font-medium">المشاعر:</span>
                      <span className="ml-1">{result.emotionalState}</span>
                    </div>
                    <div>
                      <span className="font-medium">وقت المعالجة:</span>
                      <span className="ml-1">{result.processingTime}ms</span>
                    </div>
                  </div>
                  
                  {result.reasoning && (
                    <div className="text-sm">
                      <span className="font-medium">التفسير:</span>
                      <p className="text-muted-foreground mt-1">{result.reasoning}</p>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span>RAG متاح: {result.canSolveWithRAG ? '✓' : '✗'}</span>
                    <span>الحالة: {result.success ? 'نجح' : 'فشل'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Scenarios Reference */}
      <Card>
        <CardHeader>
          <CardTitle>سيناريوهات الاختبار</CardTitle>
          <CardDescription>
            أمثلة على الرسائل التي يتم اختبارها والنتائج المتوقعة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {testScenarios.map((scenario) => (
              <div key={scenario.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{scenario.title}</h4>
                  <Badge variant="outline">
                    {getDecisionText(scenario.expectedDecision)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  "{scenario.message}"
                </p>
                <p className="text-xs text-muted-foreground">
                  {scenario.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>نصائح للاختبار:</strong>
          <ul className="mt-2 space-y-1 text-sm">
            <li>• جرب رسائل مختلفة بمستويات مشاعر متنوعة</li>
            <li>• راقب أوقات المعالجة للتأكد من الأداء</li>
            <li>• تحقق من دقة تحليل المشاعر والنوايا</li>
            <li>• اختبر رسائل باللغتين العربية والإنجليزية</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default SmartEscalationTesting;