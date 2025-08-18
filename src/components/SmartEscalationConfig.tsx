import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Brain, TrendingUp, AlertTriangle, MessageSquare, Zap } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import logger from '@/utils/logger';

interface SmartEscalationConfig {
  id?: string;
  enable_smart_escalation: boolean;
  escalation_sensitivity: number;
  emotion_threshold: number;
  urgency_threshold: number;
  rag_confidence_threshold: number;
  max_ai_attempts: number;
  escalation_delay_minutes: number;
  ai_attempt_message: string;
  escalation_warning_message: string;
}

interface EscalationAnalytics {
  total_escalations: number;
  smart_escalations: number;
  keyword_escalations: number;
  avg_confidence_score: number;
  avg_ai_attempts: number;
  high_urgency_count: number;
  rag_solvable_count: number;
  resolved_count: number;
  avg_resolution_hours: number;
}

interface SmartEscalationConfigProps {
  instanceId: string;
}

const defaultConfig: SmartEscalationConfig = {
  enable_smart_escalation: true,
  escalation_sensitivity: 0.7,
  emotion_threshold: 0.8,
  urgency_threshold: 0.7,
  rag_confidence_threshold: 0.6,
  max_ai_attempts: 2,
  escalation_delay_minutes: 5,
  ai_attempt_message: 'دعني أحاول مساعدتك في هذا الأمر...',
  escalation_warning_message: 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين'
};

export const SmartEscalationConfig = ({ instanceId }: SmartEscalationConfigProps) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<SmartEscalationConfig>(defaultConfig);
  const [analytics, setAnalytics] = useState<EscalationAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user && instanceId) {
      loadSmartEscalationConfig();
      loadAnalytics();
    }
  }, [user, instanceId]);

  const loadSmartEscalationConfig = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('smart_escalation_config')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        setConfig(data);
      } else {
        // Create default config if none exists
        const { data: newConfig, error: createError } = await supabase
          .from('smart_escalation_config')
          .insert({
            whatsapp_instance_id: instanceId,
            user_id: user?.id,
            ...defaultConfig
          })
          .select()
          .single();
          
        if (createError) throw createError;
        setConfig(newConfig);
      }
    } catch (error) {
      logger.error('Error loading smart escalation config:', error);
      toast.error('فشل في تحميل إعدادات التصعيد الذكي');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('smart_escalation_analytics')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        logger.error('Error loading analytics:', error);
        return;
      }
      
      setAnalytics(data);
    } catch (error) {
      logger.error('Error loading escalation analytics:', error);
    }
  };

  const saveConfig = async () => {
    if (!config.id) {
      toast.error('لا يمكن حفظ الإعدادات - معرف الإعداد مفقود');
      return;
    }

    try {
      setIsSaving(true);
      
      const { error } = await supabase
        .from('smart_escalation_config')
        .update({
          enable_smart_escalation: config.enable_smart_escalation,
          escalation_sensitivity: config.escalation_sensitivity,
          emotion_threshold: config.emotion_threshold,
          urgency_threshold: config.urgency_threshold,
          rag_confidence_threshold: config.rag_confidence_threshold,
          max_ai_attempts: config.max_ai_attempts,
          escalation_delay_minutes: config.escalation_delay_minutes,
          ai_attempt_message: config.ai_attempt_message,
          escalation_warning_message: config.escalation_warning_message,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);
      
      if (error) throw error;
      
      toast.success('تم حفظ إعدادات التصعيد الذكي بنجاح');
      await loadAnalytics(); // Reload analytics after saving
    } catch (error) {
      logger.error('Error saving smart escalation config:', error);
      toast.error('فشل في حفظ إعدادات التصعيد الذكي');
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (field: keyof SmartEscalationConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const efficiencyScore = analytics ? 
    Math.round(((analytics.smart_escalations || 0) / Math.max(analytics.total_escalations, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي التصعيدات</p>
                  <p className="text-2xl font-bold">{analytics.total_escalations || 0}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">كفاءة النظام الذكي</p>
                  <p className="text-2xl font-bold">{efficiencyScore}%</p>
                </div>
                <Brain className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">متوسط المحاولات</p>
                  <p className="text-2xl font-bold">{Math.round(analytics.avg_ai_attempts || 0)}</p>
                </div>
                <Zap className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">معدل الحل</p>
                  <p className="text-2xl font-bold">
                    {Math.round(((analytics.resolved_count || 0) / Math.max(analytics.total_escalations, 1)) * 100)}%
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="h-5 w-5 mr-2" />
            إعدادات التصعيد الذكي
          </CardTitle>
          <CardDescription>
            قم بتخصيص معايير التصعيد الذكي لتحسين كفاءة النظام وتجربة العملاء
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Smart Escalation */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">تفعيل التصعيد الذكي</Label>
              <div className="text-sm text-muted-foreground">
                استخدام الذكاء الاصطناعي لتحليل الحاجة للتصعيد بدلاً من الكلمات المفتاحية
              </div>
            </div>
            <Switch
              checked={config.enable_smart_escalation}
              onCheckedChange={(checked) => updateConfig('enable_smart_escalation', checked)}
            />
          </div>

          <Separator />

          {config.enable_smart_escalation && (
            <>
              {/* Sensitivity Settings */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">معايير التصعيد</Label>
                
                {/* Escalation Sensitivity */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>حساسية التصعيد العامة</Label>
                    <Badge variant="outline">{Math.round(config.escalation_sensitivity * 100)}%</Badge>
                  </div>
                  <Slider
                    value={[config.escalation_sensitivity]}
                    onValueChange={([value]) => updateConfig('escalation_sensitivity', value)}
                    max={1}
                    min={0.1}
                    step={0.05}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    أقل = تصعيد أكثر حذراً، أعلى = تصعيد أسرع
                  </p>
                </div>

                {/* Emotion Threshold */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>حد المشاعر السلبية</Label>
                    <Badge variant="outline">{Math.round(config.emotion_threshold * 100)}%</Badge>
                  </div>
                  <Slider
                    value={[config.emotion_threshold]}
                    onValueChange={([value]) => updateConfig('emotion_threshold', value)}
                    max={1}
                    min={0.1}
                    step={0.05}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    مستوى الإحباط/الغضب المطلوب للتصعيد الفوري
                  </p>
                </div>

                {/* Urgency Threshold */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>حد الاستعجال</Label>
                    <Badge variant="outline">{Math.round(config.urgency_threshold * 100)}%</Badge>
                  </div>
                  <Slider
                    value={[config.urgency_threshold]}
                    onValueChange={([value]) => updateConfig('urgency_threshold', value)}
                    max={1}
                    min={0.1}
                    step={0.05}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    مستوى الاستعجال المطلوب للتصعيد السريع
                  </p>
                </div>

                {/* RAG Confidence Threshold */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>حد ثقة قاعدة المعرفة</Label>
                    <Badge variant="outline">{Math.round(config.rag_confidence_threshold * 100)}%</Badge>
                  </div>
                  <Slider
                    value={[config.rag_confidence_threshold]}
                    onValueChange={([value]) => updateConfig('rag_confidence_threshold', value)}
                    max={1}
                    min={0.1}
                    step={0.05}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    مستوى الثقة المطلوب لمحاولة الحل بالذكاء الاصطناعي
                  </p>
                </div>
              </div>

              <Separator />

              {/* Attempt Settings */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">إعدادات المحاولات</Label>
                
                {/* Max AI Attempts */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>عدد محاولات الذكاء الاصطناعي</Label>
                    <Badge variant="outline">{config.max_ai_attempts}</Badge>
                  </div>
                  <Slider
                    value={[config.max_ai_attempts]}
                    onValueChange={([value]) => updateConfig('max_ai_attempts', value)}
                    max={5}
                    min={0}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    عدد محاولات حل المشكلة بالذكاء الاصطناعي قبل التصعيد
                  </p>
                </div>

                {/* Escalation Delay */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>تأخير التصعيد (دقائق)</Label>
                    <Badge variant="outline">{config.escalation_delay_minutes}</Badge>
                  </div>
                  <Slider
                    value={[config.escalation_delay_minutes]}
                    onValueChange={([value]) => updateConfig('escalation_delay_minutes', value)}
                    max={60}
                    min={0}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    وقت الانتظار قبل التصعيد (0 = تصعيد فوري)
                  </p>
                </div>
              </div>

              <Separator />

              {/* Custom Messages */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">الرسائل المخصصة</Label>
                
                {/* AI Attempt Message */}
                <div className="space-y-2">
                  <Label>رسالة محاولة الذكاء الاصطناعي</Label>
                  <LanguageAwareTextarea
                    value={config.ai_attempt_message}
                    onChange={(e) => updateConfig('ai_attempt_message', e.target.value)}
                    placeholder="الرسالة التي ترسل عند محاولة حل المشكلة بالذكاء الاصطناعي"
                    rows={2}
                  />
                </div>

                {/* Escalation Warning Message */}
                <div className="space-y-2">
                  <Label>رسالة تحذير التصعيد</Label>
                  <LanguageAwareTextarea
                    value={config.escalation_warning_message}
                    onChange={(e) => updateConfig('escalation_warning_message', e.target.value)}
                    placeholder="الرسالة التي ترسل قبل التصعيد للدعم البشري"
                    rows={2}
                  />
                </div>
              </div>
            </>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={saveConfig}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  حفظ الإعدادات
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tips and Information */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>نصائح للاستخدام الأمثل:</strong>
          <ul className="mt-2 space-y-1 text-sm">
            <li>• ابدأ بالإعدادات الافتراضية ثم اضبطها حسب احتياجاتك</li>
            <li>• راقب الإحصائيات لتقييم أداء النظام</li>
            <li>• حساسية أعلى = تصعيد أكثر، حساسية أقل = محاولات ذكية أكثر</li>
            <li>• تأكد من وجود محتوى كافي في قاعدة المعرفة لتحسين الأداء</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default SmartEscalationConfig;