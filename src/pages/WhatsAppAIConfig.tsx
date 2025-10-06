import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { LanguageAwareInput } from '@/components/ui/language-aware-input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Lightbulb, Users, Cog, Bot, ChevronLeft, ChevronRight, CircleCheck, AudioLines, BrainCog } from 'lucide-react';
import WhatsAppAIToggle from '@/components/WhatsAppAIToggle';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import logger from '@/utils/logger';
import { usePromptGenerationStats } from '@/hooks/use-prompt-generation-stats';
// Removed unused import: format from date-fns
import { PromptResetCountdown } from '@/components/ui/prompt-reset-countdown';
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

// Multi-step prompt generation interfaces
interface PromptGenerationData {
  businessType: string;
  languages: string[];
  arabicDialect?: string;
  tone: string;
  specialInstructions?: string;
  description: string;
}

// These will be translated dynamically in the component
const getBusinessTypes = (t: (key: string) => string) => [
  { value: 'ecommerce', label: t('aiConfiguration.ecommerce') },
  { value: 'services', label: t('aiConfiguration.services') },
  { value: 'healthcare', label: t('aiConfiguration.healthcare') },
  { value: 'education', label: t('aiConfiguration.education') },
  { value: 'restaurant', label: t('aiConfiguration.restaurant') },
  { value: 'realestate', label: t('aiConfiguration.realestate') },
  { value: 'finance', label: t('aiConfiguration.finance') },
  { value: 'technology', label: t('aiConfiguration.technology') },
  { value: 'retail', label: t('aiConfiguration.retail') },
  { value: 'other', label: t('aiConfiguration.other') }
];

const getLanguageOptions = (t: (key: string) => string) => [
  { value: 'arabic', label: t('aiConfiguration.arabicOnly') },
  { value: 'english', label: t('aiConfiguration.englishOnly') },
  { value: 'both', label: t('aiConfiguration.bothLanguages') }
];

const getArabicDialects = (t: (key: string) => string) => [
  { value: 'standard', label: t('aiConfiguration.modernStandardArabic') },
  { value: 'egyptian', label: t('aiConfiguration.egyptianArabic') },
  { value: 'saudi', label: t('aiConfiguration.saudiArabic') },
  { value: 'gulf', label: t('aiConfiguration.gulfArabic') },
  { value: 'levantine', label: t('aiConfiguration.levantineArabic') },
  { value: 'maghrebi', label: t('aiConfiguration.maghrebiArabic') }
];

const getToneOptions = (t: (key: string) => string) => [
  { value: 'professional', label: t('aiConfiguration.professional') },
  { value: 'friendly', label: t('aiConfiguration.friendly') },
  { value: 'formal', label: t('aiConfiguration.formal') },
  { value: 'casual', label: t('aiConfiguration.casual') },
  { value: 'supportive', label: t('aiConfiguration.supportive') }
];

// Status Badge Component
const StatusBadge = ({ status, t }: { status: string; t: (key: string) => string }) => {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100 border border-green-200 dark:bg-green-950/50")}>
      {t('aiConfiguration.connected')}
    </span>
  );
};

// Removed unused AIConfig interface - no longer needed

const WhatsAppAIConfig = () => {
  const {
    user,
    loading: authLoading
  } = useAuth();
  const { t } = useTranslation();
  // Removed unused navigate variable
  // Removed unused isMobile variable
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [processVoiceMessages, setProcessVoiceMessages] = useState(true);
  const [voiceMessageDefaultResponse, setVoiceMessageDefaultResponse] = useState("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
  const [defaultVoiceLanguage, setDefaultVoiceLanguage] = useState('ar');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [initialPageLoading, setInitialPageLoading] = useState(true);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [userDescription, setUserDescription] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  
  // Multi-step wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [promptData, setPromptData] = useState<PromptGenerationData>({
    businessType: '',
    languages: [],
    arabicDialect: '',
    tone: '',
    specialInstructions: '',
    description: ''
  });
  // Removed unused showVoiceFeature and promptGenerationStats variables
  const {
    stats: promptStats,
    isLoading: isLoadingStats,
    refreshStats
  } = usePromptGenerationStats();
  
  // NEW: Personality system state - Always enabled
  const [usePersonalitySystem] = useState(true); // Personality system is always enabled
  const intentRecognitionEnabled = true; // Intent Recognition is always enabled - no toggle needed
  const [personalityCount, setPersonalityCount] = useState(0);


  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
    }
    // Set initial page loading to false after a short delay
    const timer = setTimeout(() => {
      setInitialPageLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (selectedInstance) {
      loadAIConfig();
      loadPersonalityCount();
    } else {
      setSystemPrompt('');
      setProcessVoiceMessages(true);
      setVoiceMessageDefaultResponse("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
      setDefaultVoiceLanguage('ar');
      // usePersonalitySystem is always true, no need to set it
      setPersonalityCount(0);
    }
  }, [selectedInstance]);


  const loadWhatsAppInstances = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_instances').select('id, instance_name, status').eq('user_id', user?.id).eq('status', 'Connected');
      if (error) throw error;
      setInstances(data || []);
      if (data && data.length > 0) {
        setSelectedInstance(data[0].id);
      }
    } catch (error) {
      logger.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIConfig = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_ai_config').select('*').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (error) {
        if (error.code === 'PGRST116') {
          setSystemPrompt('You are a helpful AI assistant. Answer questions based on the context provided.');
          setProcessVoiceMessages(true);
          setVoiceMessageDefaultResponse("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
          setDefaultVoiceLanguage('ar');
          return;
        }
        throw error;
      }
      setSystemPrompt(data.system_prompt || '');
      setProcessVoiceMessages(data.process_voice_messages !== undefined ? data.process_voice_messages : true);
      setVoiceMessageDefaultResponse(data.voice_message_default_response || "I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
      setDefaultVoiceLanguage(data.default_voice_language || 'ar');
      
      // NEW: Load personality system settings - always enabled
      // usePersonalitySystem is always true, no need to load from data
      // intentRecognitionEnabled is always true, no need to load from data
      // intent_confidence_threshold is now fixed at 0.7 - no user control needed
    } catch (error) {
      logger.error('Error loading AI config:', error);
      toast.error('Failed to load AI configuration');
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Load personality count for the instance
  const loadPersonalityCount = async () => {
    if (!selectedInstance) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'list',
          whatsappInstanceId: selectedInstance
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setPersonalityCount(data.personalities?.length || 0);
    } catch (error) {
      logger.error('Error loading personality count:', error);
      setPersonalityCount(0);
    }
  };

  const saveAIConfig = async () => {
    if (!selectedInstance || !systemPrompt.trim()) {
      toast.error('Please select a WhatsApp instance and provide a system prompt');
      return;
    }
    if (!processVoiceMessages && !voiceMessageDefaultResponse.trim()) {
      toast.error('Please provide a default response for voice messages');
      return;
    }
    try {
      setIsSaving(true);
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').update({
          system_prompt: systemPrompt,
          temperature: 1.0,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          // NEW: Personality system fields - always enabled
          use_personality_system: true,
          intent_recognition_enabled: true, // Always enabled
          intent_confidence_threshold: 0.7, // Fixed value for MVP
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').insert({
          whatsapp_instance_id: selectedInstance,
          user_id: user?.id,
          system_prompt: systemPrompt,
          temperature: 1.0,
          is_active: true,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          // NEW: Personality system fields - always enabled
          use_personality_system: true,
          intent_recognition_enabled: true, // Always enabled
          intent_confidence_threshold: 0.7 // Fixed value for MVP
        });
        if (error) throw error;
      }
      toast.success('AI configuration saved successfully');
    } catch (error) {
      logger.error('Error saving AI config:', error);
      toast.error('Failed to save AI configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Save System Prompt Configuration only
  const saveSystemPromptConfig = async () => {
    if (!selectedInstance || !systemPrompt.trim()) {
      toast.error('Please select a WhatsApp instance and provide a system prompt');
      return;
    }
    try {
      setIsSavingPrompt(true);
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').update({
          system_prompt: systemPrompt,
          temperature: 1.0,
          // Keep personality system fields - always enabled
          use_personality_system: true,
          intent_recognition_enabled: true,
          intent_confidence_threshold: 0.7,
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        // If no config exists, create one with default voice settings
        const {
          error
        } = await supabase.from('whatsapp_ai_config').insert({
          whatsapp_instance_id: selectedInstance,
          user_id: user?.id,
          system_prompt: systemPrompt,
          temperature: 1.0,
          is_active: true,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          use_personality_system: true,
          intent_recognition_enabled: true,
          intent_confidence_threshold: 0.7
        });
        if (error) throw error;
      }
      toast.success('System prompt saved successfully');
    } catch (error) {
      logger.error('Error saving system prompt:', error);
      toast.error('Failed to save system prompt');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Save Voice Message Configuration only
  const saveVoiceMessageConfig = async () => {
    if (!selectedInstance) {
      toast.error('Please select a WhatsApp instance');
      return;
    }
    if (!processVoiceMessages && !voiceMessageDefaultResponse.trim()) {
      toast.error('Please provide a default response for voice messages');
      return;
    }
    try {
      setIsSavingVoice(true);
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').update({
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        // If no config exists, create one with default system prompt
        const {
          error
        } = await supabase.from('whatsapp_ai_config').insert({
          whatsapp_instance_id: selectedInstance,
          user_id: user?.id,
          system_prompt: systemPrompt || 'You are a helpful AI assistant. Answer questions based on the context provided.',
          temperature: 1.0,
          is_active: true,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          use_personality_system: true,
          intent_recognition_enabled: true,
          intent_confidence_threshold: 0.7
        });
        if (error) throw error;
      }
      toast.success('Voice message settings saved successfully');
    } catch (error) {
      logger.error('Error saving voice message settings:', error);
      toast.error('Failed to save voice message settings');
    } finally {
      setIsSavingVoice(false);
    }
  };

  const generateSystemPrompt = async () => {
    openPromptWizard();
  };

  const handleGenerateSystemPrompt = async () => {
    if (!promptData.description.trim()) {
      toast.error('Please enter a description of what you want the AI to do');
      return;
    }
    if (promptStats && promptStats.remaining <= 0) {
      toast.error(`Monthly prompt generation limit reached (${promptStats.used}/${promptStats.limit})`);
      return;
    }
    try {
      setIsGeneratingPrompt(true);
      const {
        data,
        error
      } = await supabase.functions.invoke('generate-system-prompt', {
        body: {
          ...promptData,
          businessType: promptData.businessType === 'other' ? customBusinessType : promptData.businessType,
          description: promptData.description
        }
      });
      if (error) throw error;
      if (!data.success) {
        if (data.error === 'Monthly prompt generation limit reached') {
          toast.error(`Monthly limit reached (${data.details.used}/${data.details.limit})`);
          await refreshStats();
        } else {
          throw new Error(data.error || 'Failed to generate system prompt');
        }
        return;
      }
      setSystemPrompt(data.prompt);
      setPromptDialogOpen(false);
      // Reset wizard data
      setPromptData({
        businessType: '',
        languages: [],
        arabicDialect: '',
        tone: '',
        specialInstructions: '',
        description: ''
      });
      setCustomBusinessType('');
      setUserDescription('');
      await refreshStats();
      toast.success('System prompt generated successfully');
    } catch (error) {
      logger.error('Error generating system prompt:', error);
      toast.error('Failed to generate system prompt. Please try again.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };


  // Reset wizard data when opening dialog
  const openPromptWizard = () => {
    setCurrentStep(1);
    setCustomBusinessType('');
    setPromptData({
      businessType: '',
      languages: [],
      arabicDialect: '',
      tone: '',
      specialInstructions: '',
      description: ''
    });
    setUserDescription('');
    setPromptDialogOpen(true);
  };

  // Move to next step
  const nextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Move to previous step
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Step 1: Business Type
  const renderStep1 = () => {
    const businessTypes = getBusinessTypes(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiConfiguration.businessTypeQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiConfiguration.businessTypeDescription')}</p>
        </div>
        <Select
          value={promptData.businessType}
          onValueChange={(value) => {
            setPromptData(prev => ({...prev, businessType: value}));
            if (value !== 'other') {
              setCustomBusinessType('');
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('aiConfiguration.selectBusinessType')} />
          </SelectTrigger>
          <SelectContent>
            {businessTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {promptData.businessType === 'other' && (
          <div>
            <Label className="text-sm font-medium">{t('aiConfiguration.specifyBusinessType')}</Label>
            <LanguageAwareInput
              value={customBusinessType}
              onChange={(e) => setCustomBusinessType(e.target.value)}
              placeholder={t('aiConfiguration.businessTypePlaceholder')}
              className="mt-2"
            />
          </div>
        )}
      </div>
    );
  };

  // Step 2: Language Settings
  const renderStep2 = () => {
    const languageOptions = getLanguageOptions(t);
    const arabicDialects = getArabicDialects(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiConfiguration.languagesQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiConfiguration.languagesDescription')}</p>
        </div>
        <Select
          value={promptData.languages.length > 0 ? promptData.languages[0] : ''}
          onValueChange={(value) => setPromptData(prev => ({...prev, languages: [value]}))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('aiConfiguration.selectPreferredLanguage')} />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(promptData.languages.includes('arabic') || promptData.languages.includes('both')) && (
          <div>
            <Label className="text-sm font-medium">{t('aiConfiguration.arabicDialectQuestion')}</Label>
            <Select
              value={promptData.arabicDialect}
              onValueChange={(value) => setPromptData(prev => ({...prev, arabicDialect: value}))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('aiConfiguration.selectArabicDialect')} />
              </SelectTrigger>
              <SelectContent>
                {arabicDialects.map((dialect) => (
                  <SelectItem key={dialect.value} value={dialect.value}>
                    {dialect.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Tone & Personality
  const renderStep3 = () => {
    const toneOptions = getToneOptions(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiConfiguration.toneQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiConfiguration.toneDescription')}</p>
        </div>
        <Select
          value={promptData.tone}
          onValueChange={(value) => setPromptData(prev => ({...prev, tone: value}))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('aiConfiguration.selectTone')} />
          </SelectTrigger>
          <SelectContent>
            {toneOptions.map((tone) => (
              <SelectItem key={tone.value} value={tone.value}>
                {tone.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  // Step 4: Final Description (swapped from step 5)
  const renderStep4 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('aiConfiguration.descriptionQuestion')}</Label>
        <p className="text-sm text-muted-foreground mb-3">{t('aiConfiguration.descriptionSubtext')}</p>
      </div>
      <LanguageAwareTextarea
        value={promptData.description}
        onChange={(e) => setPromptData(prev => ({...prev, description: e.target.value}))}
        placeholder={t('aiConfiguration.descriptionPlaceholder')}
        rows={4}
        className="resize-y"
      />
    </div>
  );

  // Step 5: Special Instructions (swapped from step 4)
  const renderStep5 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('aiConfiguration.specialInstructions')}</Label>
        <p className="text-sm text-muted-foreground mb-3">{t('aiConfiguration.specialInstructionsDescription')}</p>
      </div>
      <LanguageAwareTextarea
        value={promptData.specialInstructions}
        onChange={(e) => setPromptData(prev => ({...prev, specialInstructions: e.target.value}))}
        placeholder={t('aiConfiguration.specialInstructionsPlaceholder')}
        rows={4}
        className="resize-y"
      />
    </div>
  );

  // Can proceed to next step
  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return promptData.businessType !== '' && (promptData.businessType !== 'other' || customBusinessType.trim() !== '');
      case 2:
        return promptData.languages.length > 0;
      case 3:
        return promptData.tone !== '';
      case 4:
        return promptData.description.trim() !== ''; // Description is now required in step 4
      case 5:
        return true; // Special instructions are optional in step 5
      default:
        return false;
    }
  };

  // Modern loading state similar to WhatsApp Instances
  if (authLoading || initialPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          {/* Modern animated loader with gradient */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <BrainCog className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('aiConfiguration.loadingTitle')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('aiConfiguration.loadingDescription')}
            </p>
          </div>
          
          {/* Loading dots animation */}
          <div className="flex space-x-1">
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                {t('aiConfiguration.title')}
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  {t('aiConfiguration.description')}
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* WhatsApp Instance Selection */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                {t('aiConfiguration.chooseWhatsappNumber')}
              </h2>
            </div>

            <Select
              value={selectedInstance}
              onValueChange={(value) => setSelectedInstance(value)}
              disabled={isLoading || instances.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('aiConfiguration.selectWhatsappNumber')} />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none">
                    {t('aiConfiguration.noConnectedNumbers')}
                  </SelectItem>
                ) : (
                  instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center justify-between w-full gap-x-2">
                        <span>{instance.instance_name}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                          {t('aiConfiguration.connected')}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {selectedInstance && instances.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <WhatsAppAIToggle instanceId={selectedInstance} instanceName={instances.find(i => i.id === selectedInstance)?.instance_name || ''} instanceStatus={instances.find(i => i.id === selectedInstance)?.status} variant="detailed" />
            </div>
          </div>
        )}
        
        {/* No WhatsApp Number Connected - Separate Container */}
        {!selectedInstance && (
          <div className="bg-blue-50 dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="py-8 text-center">
                <div className="flex flex-col items-center space-y-4 max-w-md mx-auto">
                  <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {t('aiConfiguration.noInstanceSelected')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {t('aiConfiguration.noInstanceDescription')}
                    </p>
                  </div>
                  <Button
                    asChild
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Link to="/whatsapp">
                      {t('aiConfiguration.connectWhatsApp')}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI System Prompt - Separate Container */}
        {selectedInstance && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  {t('aiConfiguration.aiSystemPrompt')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('aiConfiguration.promptInstructions')}
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="system-prompt">{t('aiConfiguration.prompt')}</Label>
                    <Button variant="outline" size="sm" onClick={generateSystemPrompt} disabled={isLoading || !selectedInstance}>
                      <Lightbulb className="mr-2 h-4 w-4" />
                      {t('aiConfiguration.autoGeneratePrompt')}
                    </Button>
                  </div>
                  <LanguageAwareTextarea id="system-prompt" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={8} placeholder={t('aiConfiguration.promptPlaceholder')} className="resize-y" />
                </div>
                <Button onClick={saveSystemPromptConfig} disabled={isSavingPrompt || !systemPrompt.trim() || !selectedInstance} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                  {isSavingPrompt ? t('aiConfiguration.saving') : t('aiConfiguration.saveConfiguration')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* AI Personality System - Separate Container */}
        {selectedInstance && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t('aiConfiguration.aiPersonalitySystem')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('aiConfiguration.personalitySystemDescription')}
                </p>
              </div>
              <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                        <Users className="h-4 w-4 text-blue-900 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 sm:flex-auto">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {personalityCount > 0 ? `${personalityCount} ${t('aiConfiguration.personalitiesConfigured')}` : t('aiConfiguration.noPersonalitiesYet')}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-300 font-normal">
                          {personalityCount > 0
                            ? t('aiConfiguration.intelligentSwitching')
                            : t('aiConfiguration.createPersonalities')
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-700 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900 rounded-lg w-full sm:w-auto"
                      >
                        <Link to="/ai-personalities">
                          <Cog className="h-4 w-4 mr-2" />
                          {t('aiConfiguration.managePersonalities')}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice Message Settings - Separate Container */}
        {selectedInstance && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                      <AudioLines className="h-5 w-5" />
                      {t('aiConfiguration.voiceMessageSettings')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {t('aiConfiguration.voiceMessageDescription')}
                    </p>
                  </div>
                  <div className="ml-6">
                    <Switch id="process-voice" checked={processVoiceMessages} onCheckedChange={setProcessVoiceMessages} className="data-[state=checked]:bg-green-500 data-[state=checked]:hover:bg-green-400" />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="voice-language">{t('aiConfiguration.voiceMessageLanguage')}</Label>
                  <Select value={defaultVoiceLanguage} onValueChange={setDefaultVoiceLanguage}>
                    <SelectTrigger id="voice-language" className="w-full">
                      <SelectValue placeholder={t('aiConfiguration.selectLanguage')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">{t('aiConfiguration.arabic')}</SelectItem>
                      <SelectItem value="en">{t('aiConfiguration.english')}</SelectItem>
                      <SelectItem value="auto">{t('aiConfiguration.autoDetect')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('aiConfiguration.voiceLanguageDescription')}
                  </p>
                </div>

                {!processVoiceMessages && <div className="space-y-2">
                    <Label htmlFor="voice-default-response">
                      {t('aiConfiguration.defaultVoiceResponse')}
                    </Label>
                    <LanguageAwareTextarea id="voice-default-response" value={voiceMessageDefaultResponse} onChange={e => setVoiceMessageDefaultResponse(e.target.value)} placeholder={t('aiConfiguration.voiceResponsePlaceholder')} rows={3} />
                    <p className="text-xs text-muted-foreground">
                      {t('aiConfiguration.voiceResponseDescription')}
                    </p>
                  </div>}

                <Button onClick={saveVoiceMessageConfig} disabled={isSavingVoice || !selectedInstance || !processVoiceMessages && !voiceMessageDefaultResponse.trim()} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                  {isSavingVoice ? t('aiConfiguration.saving') : t('aiConfiguration.saveConfiguration')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl py-6 px-6">
        <DialogHeader>
          <DialogTitle className="text-left font-semibold">{t('aiConfiguration.promptWizardTitle')}</DialogTitle>
          <DialogDescription className="text-left">
            {t('aiConfiguration.promptWizardDescription')}
          </DialogDescription>
          {promptStats && (
            <div className="mt-2 text-sm">
              <div className="flex justify-between items-center">
                <span>
                  {promptStats.remaining} {t('aiConfiguration.generationsRemaining')}
                </span>
                <span className="text-muted-foreground">
                  ({promptStats.used}/{promptStats.limit} {t('aiConfiguration.used')})
                </span>
              </div>
              {promptStats.timeUntilReset && (
                <PromptResetCountdown
                  timeUntilReset={promptStats.timeUntilReset}
                  className="mt-1"
                />
              )}
            </div>
          )}
        </DialogHeader>
        
        {/* Progress Indicator - Improved for mobile */}
        <div className="flex items-center justify-between mb-4 overflow-x-auto py-4">
          <div className="flex items-center min-w-fit mx-auto px-2">
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium flex-shrink-0 transition-colors",
                  step < currentStep ? "bg-green-600 text-white" : 
                  step === currentStep ? "bg-blue-600 text-white animate-pulse" : 
                  "bg-gray-200 text-gray-500"
                )}>
                  {step < currentStep ? <CircleCheck className="h-3 w-3 sm:h-4 sm:w-4" /> : step}
                </div>
                {step < 5 && (
                  <div className={cn(
                    "w-8 sm:w-12 md:w-16 h-0.5 mx-1 sm:mx-2 transition-colors",
                    step < currentStep ? "bg-green-500" : "bg-gray-200"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Step Content - Improved spacing for mobile */}
        <div className="min-h-[200px] sm:min-h-[250px] py-2 sm:py-4 overflow-y-auto max-h-[50vh] sm:max-h-[60vh]">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
        </div>
        
        {/* Navigation Footer - Improved for mobile */}
        <DialogFooter className="pt-4 border-t">
          <div className="flex flex-col sm:flex-row sm:justify-between w-full gap-2 sm:gap-3">
            <div className="flex gap-2 w-full sm:w-auto order-2 sm:order-1">
              <Button
                variant="outline"
                onClick={() => setPromptDialogOpen(false)}
                className="flex-1 sm:flex-none text-xs sm:text-sm px-3 py-2"
              >
                {t('aiConfiguration.cancel')}
              </Button>
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  onClick={prevStep}
                  className="flex items-center justify-center gap-1 flex-1 sm:flex-none text-xs sm:text-sm px-3 py-2"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{t('aiConfiguration.previous')}</span>
                  <span className="sm:hidden">{t('aiConfiguration.back')}</span>
                </Button>
              )}
            </div>

            <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
              {currentStep < 5 ? (
                <Button
                  onClick={nextStep}
                  disabled={!canProceedToNextStep()}
                  className="flex items-center justify-center gap-1 w-full sm:w-auto text-xs sm:text-sm px-3 py-2 bg-blue-600 hover:bg-blue-700"
                >
                  <span>{t('aiConfiguration.next')}</span>
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateSystemPrompt}
                  disabled={isGeneratingPrompt || !promptData.description.trim() || isLoadingStats || promptStats?.remaining === 0}
                  className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 w-full sm:w-auto text-xs sm:text-sm px-3 py-2"
                >
                  {isGeneratingPrompt ? (
                    <>
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin flex-shrink-0" />
                      <span>{t('aiConfiguration.generating')}</span>
                    </>
                  ) : promptStats?.remaining === 0 ? (
                    <span>{t('aiConfiguration.limitReached')}</span>
                  ) : (
                    <>
                      <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{t('aiConfiguration.generatePrompt')}</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>;
};

export default WhatsAppAIConfig;
