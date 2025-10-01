import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Star, 
  BarChart3, 
  Brain, 
  Users, 
  MessageSquare,
  Loader2,
  Palette,
  FileText,
  Bot,
  Cog,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  CircleCheck
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import logger from '@/utils/logger';
import { usePromptGenerationStats } from '@/hooks/use-prompt-generation-stats';
import { PromptResetCountdown } from '@/components/ui/prompt-reset-countdown';
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface Personality {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  temperature: number;
  model: string;
  intent_categories: string[];
  is_active: boolean;
  is_default: boolean;
  priority: number;
  process_voice_messages: boolean;
  voice_message_default_response: string;
  default_voice_language: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
  template_category?: string;
}

interface PersonalityTemplate {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  template_category: string;
  intent_categories: string[];
}

// Auto-generate prompt interface
interface PromptGenerationData {
  businessType: string;
  languages: string[];
  arabicDialect?: string;
  tone: string;
  specialInstructions?: string;
  description: string;
}

// Business types options for prompt generation
const getBusinessTypes = (t: (key: string) => string) => [
  { value: 'ecommerce', label: t('aiPersonalities.ecommerce') },
  { value: 'services', label: t('aiPersonalities.services') },
  { value: 'healthcare', label: t('aiPersonalities.healthcare') },
  { value: 'education', label: t('aiPersonalities.education') },
  { value: 'restaurant', label: t('aiPersonalities.restaurant') },
  { value: 'realestate', label: t('aiPersonalities.realestate') },
  { value: 'finance', label: t('aiPersonalities.finance') },
  { value: 'technology', label: t('aiPersonalities.technology') },
  { value: 'retail', label: t('aiPersonalities.retail') },
  { value: 'other', label: t('aiPersonalities.other') }
];

// Language options for prompt generation
const getLanguageOptions = (t: (key: string) => string) => [
  { value: 'arabic', label: t('aiPersonalities.arabicOnly') },
  { value: 'english', label: t('aiPersonalities.englishOnly') },
  { value: 'both', label: t('aiPersonalities.bothLanguages') }
];

// Arabic dialect options for prompt generation
const getArabicDialects = (t: (key: string) => string) => [
  { value: 'standard', label: t('aiPersonalities.modernStandardArabic') },
  { value: 'egyptian', label: t('aiPersonalities.egyptianArabic') },
  { value: 'saudi', label: t('aiPersonalities.saudiArabic') },
  { value: 'gulf', label: t('aiPersonalities.gulfArabic') },
  { value: 'levantine', label: t('aiPersonalities.levantineArabic') },
  { value: 'maghrebi', label: t('aiPersonalities.maghrebiArabic') }
];

// Tone options for prompt generation
const getToneOptions = (t: (key: string) => string) => [
  { value: 'professional', label: t('aiPersonalities.professional') },
  { value: 'friendly', label: t('aiPersonalities.friendly') },
  { value: 'formal', label: t('aiPersonalities.formal') },
  { value: 'casual', label: t('aiPersonalities.casual') },
  { value: 'supportive', label: t('aiPersonalities.supportive') }
];

// Memoized PersonalityCard component
const PersonalityCard = React.memo<{
  personality: Personality;
  onEdit: (personality: Personality) => void;
  onDelete: (personalityId: string) => void;
  intentCategoriesMap: Map<string, string>;
  t: (key: string) => string;
}>(({ personality, onEdit, onDelete, intentCategoriesMap, t }) => (
  <Card className={`h-full w-full flex flex-col ${personality.is_default ? 'ring-2 ring-blue-500' : ''} border-slate-200 dark:border-slate-700`}>
    <CardHeader className="pb-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            {personality.name}
            {personality.is_default && (
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
            )}
          </CardTitle>
          <CardDescription className="text-sm">
            {personality.description}
          </CardDescription>
        </div>
      </div>
      
      {/* Intent Categories */}
      <div className="flex flex-wrap gap-1 mt-2">
        {personality.intent_categories.map(category => (
          <Badge key={category} variant="secondary" className="text-xs">
            {intentCategoriesMap.get(category) || category}
          </Badge>
        ))}
      </div>
    </CardHeader>
    
    <CardContent className="pt-0 flex-grow flex flex-col">
      <div className="flex-grow">
        {/* Usage Statistics */}
        <div className="text-sm text-muted-foreground mb-4">
          <div>{t('aiPersonalities.used')}: {personality.usage_count} {t('aiPersonalities.times')}</div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant={personality.is_active ? "default" : "secondary"}>
            {personality.is_active ? t('aiPersonalities.active') : t('aiPersonalities.inactive')}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t('aiPersonalities.priority')}: {personality.priority}
          </span>
        </div>
      </div>

      {/* Actions - Fixed at Bottom */}
      <div className="flex gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(personality)}
          className="flex-1"
        >
          <Edit className="h-4 w-4 mr-1" />
          {t('aiPersonalities.edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(personality.id)}
          disabled={personality.is_default}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
));

// Memoized TemplateCard component
const TemplateCard = React.memo<{
  template: PersonalityTemplate;
  onClone: (templateId: string) => void;
  intentCategoriesMap: Map<string, string>;
  isLoading: boolean;
  t: (key: string) => string;
}>(({ template, onClone, intentCategoriesMap, isLoading, t }) => (
  <Card className="h-full w-full flex flex-col border-slate-200 dark:border-slate-700">
    <CardHeader className="flex-grow">
      <CardTitle className="text-lg font-semibold flex items-center gap-2">
        <Bot className="h-5 w-5 text-blue-600" />
        {template.name}
      </CardTitle>
      <CardDescription>
        {template.description}
      </CardDescription>
      
      {/* Intent Categories */}
      <div className="flex flex-wrap gap-1 mt-2">
        {template.intent_categories.map(category => (
          <Badge key={category} variant="outline" className="text-xs">
            {intentCategoriesMap.get(category) || category}
          </Badge>
        ))}
      </div>
    </CardHeader>
    
    <CardContent className="mt-auto">
      <Button
        onClick={() => onClone(template.id)}
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        <Copy className="h-4 w-4 mr-2" />
        {t('aiPersonalities.addThisPersonality')}
      </Button>
    </CardContent>
  </Card>
));

const AIPersonalities = React.memo(() => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  
  // State management
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [templates, setTemplates] = useState<PersonalityTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPersonalities, setIsLoadingPersonalities] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [initialPageLoading, setInitialPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personalities');
  const [usageAnalytics, setUsageAnalytics] = useState<Record<string, number>>({});
  
  // Auto-generate prompt states
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
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
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  
  // Prompt generation stats
  const {
    stats: promptStats,
    isLoading: isLoadingStats,
    refreshStats
  } = usePromptGenerationStats();
  
  // Dialog states
  const [isPersonalityDialogOpen, setIsPersonalityDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingPersonality, setEditingPersonality] = useState<Personality | null>(null);
  
  // Form states
  const [personalityForm, setPersonalityForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    temperature: 0.7,
    model: 'gpt-4.1-mini',
    intent_categories: [] as string[],
    is_active: true,
    is_default: false,
    priority: 1,
    process_voice_messages: true,
    voice_message_default_response: '',
    default_voice_language: 'en'
  });

  // Available intent categories - optimized as array and Map
  const intentCategories = useMemo(() => [
    { key: 'customer-support', label: t('aiPersonalities.customerSupport') },
    { key: 'sales', label: t('aiPersonalities.salesInquiries') },
    { key: 'technical', label: t('aiPersonalities.technicalSupport') },
    { key: 'billing', label: t('aiPersonalities.billingAndPayments') },
    { key: 'general', label: t('aiPersonalities.generalInformation') }
  ], [t]);
  
  // Create lookup Map for O(1) category label access
  const intentCategoriesMap = useMemo(() => 
    new Map(intentCategories.map(c => [c.key, c.label])),
    [intentCategories]
  );

  // Load WhatsApp instances - memoized
  const loadWhatsAppInstances = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id)
        .eq('status', 'Connected');
      
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
  }, [user?.id]);

  // Load personalities for selected instance - memoized
  const loadPersonalities = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'list',
          whatsappInstanceId: selectedInstance
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setPersonalities(data.personalities || []);
      
      // Load usage analytics from actual interactions
      // We'll call loadUsageAnalytics separately to avoid circular dependency
    } catch (error) {
      logger.error('Error loading personalities:', error);
      toast.error('Failed to load personalities');
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance]);
  
  // Load usage analytics from whatsapp_ai_interactions - memoized
  const loadUsageAnalytics = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      logger.info('Loading personality usage analytics', { instanceId: selectedInstance });
      
      const { data, error } = await supabase.rpc('get_personality_usage_analytics', {
        p_whatsapp_instance_id: selectedInstance
      });
      
      if (error) {
        logger.error('Error loading usage analytics:', error);
        return;
      }
      
      // Convert to a map for easy lookup
      const analyticsMap: Record<string, number> = {};
      if (data && Array.isArray(data)) {
        data.forEach((stat: any) => {
          if (stat.personality_id) {
            analyticsMap[stat.personality_id] = parseInt(stat.usage_count) || 0;
          }
        });
      }
      
      setUsageAnalytics(analyticsMap);
      logger.info('Usage analytics loaded', { 
        personalityCount: Object.keys(analyticsMap).length,
        analytics: analyticsMap 
      });
    } catch (error) {
      logger.error('Exception loading usage analytics:', error);
    }
  }, [selectedInstance]);

  // Load personality templates - memoized
  const loadTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: { action: 'get_templates' }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setTemplates(data.templates || []);
    } catch (error) {
      logger.error('Error loading templates:', error);
      toast.error('Failed to load personality templates');
    }
  }, []);

  // Reset form - memoized (moved before functions that depend on it)
  const resetForm = useCallback(() => {
    setPersonalityForm({
      name: '',
      description: '',
      system_prompt: '',
      temperature: 0.7,
      model: 'gpt-4.1-mini',
      intent_categories: [],
      is_active: true,
      is_default: false,
      priority: 1,
      process_voice_messages: true,
      voice_message_default_response: '',
      default_voice_language: 'en'
    });
  }, []);

  // Open edit dialog - memoized
  const openEditDialog = useCallback((personality: Personality) => {
    setEditingPersonality(personality);
    setPersonalityForm({
      name: personality.name,
      description: personality.description,
      system_prompt: personality.system_prompt,
      temperature: personality.temperature,
      model: personality.model,
      intent_categories: personality.intent_categories,
      is_active: personality.is_active,
      is_default: personality.is_default,
      priority: personality.priority,
      process_voice_messages: personality.process_voice_messages,
      voice_message_default_response: personality.voice_message_default_response,
      default_voice_language: personality.default_voice_language
    });
    setIsPersonalityDialogOpen(true);
  }, []);

  // Handle intent category checkbox change
  const handleIntentCategoryChange = useCallback((categoryKey: string, checked: boolean) => {
    setPersonalityForm(prev => ({
      ...prev,
      intent_categories: checked 
        ? [...prev.intent_categories, categoryKey]
        : prev.intent_categories.filter(c => c !== categoryKey)
    }));
  }, []);

  // Create or update personality - memoized (now resetForm is defined above)
  const savePersonality = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      
      const action = editingPersonality ? 'update' : 'create';
      const requestBody: any = {
        action,
        whatsappInstanceId: selectedInstance,
        data: personalityForm
      };
      
      if (editingPersonality) {
        requestBody.personalityId = editingPersonality.id;
      }
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: requestBody
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success(`Personality ${action === 'create' ? 'created' : 'updated'} successfully`);
      setIsPersonalityDialogOpen(false);
      setEditingPersonality(null);
      resetForm();
      await loadPersonalities();
    } catch (error) {
      logger.error('Error saving personality:', error);
      toast.error(`Failed to ${editingPersonality ? 'update' : 'create'} personality`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance, editingPersonality, personalityForm, loadPersonalities, resetForm]);

  // Delete personality - memoized
  const deletePersonality = useCallback(async (personalityId: string) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'delete',
          personalityId
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success('Personality deleted successfully');
      await loadPersonalities();
    } catch (error) {
      logger.error('Error deleting personality:', error);
      toast.error('Failed to delete personality');
    } finally {
      setIsLoading(false);
    }
  }, [loadPersonalities]);

  // Clone template personality - memoized
  const cloneTemplate = useCallback(async (templateId: string) => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'clone_template',
          whatsappInstanceId: selectedInstance,
          templateId
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success('Personality template added successfully');
      setIsTemplateDialogOpen(false);
      await loadPersonalities();
    } catch (error) {
      logger.error('Error cloning template:', error);
      toast.error('Failed to add personality template');
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance, loadPersonalities]);

  // Open create dialog - memoized (now resetForm is defined above)
  const openCreateDialog = useCallback(() => {
    setEditingPersonality(null);
    resetForm();
    setIsPersonalityDialogOpen(true);
  }, [resetForm]);

  // Auto-generate prompt functions
  const openPromptWizard = useCallback(() => {
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
    setPromptDialogOpen(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const canProceedToNextStep = useCallback(() => {
    switch (currentStep) {
      case 1:
        return promptData.businessType !== '' && (promptData.businessType !== 'other' || customBusinessType.trim() !== '');
      case 2:
        return promptData.languages.length > 0;
      case 3:
        return promptData.tone !== '';
      case 4:
        return promptData.description.trim() !== '';
      case 5:
        return true;
      default:
        return false;
    }
  }, [currentStep, promptData, customBusinessType]);

  const handleGenerateSystemPrompt = useCallback(async () => {
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
      const { data, error } = await supabase.functions.invoke('generate-system-prompt', {
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
      // Set the generated prompt to the personality form
      setPersonalityForm(prev => ({...prev, system_prompt: data.prompt}));
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
      setCurrentStep(1);
      await refreshStats();
      toast.success('System prompt generated successfully');
    } catch (error) {
      logger.error('Error generating system prompt:', error);
      toast.error('Failed to generate system prompt. Please try again.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  }, [promptData, customBusinessType, promptStats, refreshStats, personalityForm]);

  // Wizard step rendering functions
  const renderStep1 = () => {
    const businessTypes = getBusinessTypes(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiPersonalities.businessTypeQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiPersonalities.businessTypeDescription')}</p>
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
            <SelectValue placeholder={t('aiPersonalities.selectBusinessType')} />
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
            <Label className="text-sm font-medium">{t('aiPersonalities.specifyBusinessType')}</Label>
            <Input
              value={customBusinessType}
              onChange={(e) => setCustomBusinessType(e.target.value)}
              placeholder={t('aiPersonalities.businessTypePlaceholder')}
              className="mt-2"
            />
          </div>
        )}
      </div>
    );
  };

  const renderStep2 = () => {
    const languageOptions = getLanguageOptions(t);
    const arabicDialects = getArabicDialects(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiPersonalities.languagesQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiPersonalities.languagesDescription')}</p>
        </div>
        <Select
          value={promptData.languages.length > 0 ? promptData.languages[0] : ''}
          onValueChange={(value) => setPromptData(prev => ({...prev, languages: [value]}))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('aiPersonalities.selectPreferredLanguage')} />
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
            <Label className="text-sm font-medium">{t('aiPersonalities.arabicDialectQuestion')}</Label>
            <Select
              value={promptData.arabicDialect}
              onValueChange={(value) => setPromptData(prev => ({...prev, arabicDialect: value}))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('aiPersonalities.selectArabicDialect')} />
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

  const renderStep3 = () => {
    const toneOptions = getToneOptions(t);
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('aiPersonalities.toneQuestion')}</Label>
          <p className="text-sm text-muted-foreground mb-3">{t('aiPersonalities.toneDescription')}</p>
        </div>
        <Select
          value={promptData.tone}
          onValueChange={(value) => setPromptData(prev => ({...prev, tone: value}))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('aiPersonalities.selectTone')} />
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

  const renderStep4 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('aiPersonalities.descriptionQuestion')}</Label>
        <p className="text-sm text-muted-foreground mb-3">{t('aiPersonalities.descriptionSubtext')}</p>
      </div>
      <LanguageAwareTextarea
        value={promptData.description}
        onChange={(e) => setPromptData(prev => ({...prev, description: e.target.value}))}
        placeholder={t('aiPersonalities.descriptionPlaceholder')}
        rows={4}
        className="resize-y"
      />
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('aiPersonalities.specialInstructions')}</Label>
        <p className="text-sm text-muted-foreground mb-3">{t('aiPersonalities.specialInstructionsDescription')}</p>
      </div>
      <LanguageAwareTextarea
        value={promptData.specialInstructions}
        onChange={(e) => setPromptData(prev => ({...prev, specialInstructions: e.target.value}))}
        placeholder={t('aiPersonalities.specialInstructionsPlaceholder')}
        rows={4}
        className="resize-y"
      />
    </div>
  );

  // Load data on component mount - now all functions are defined
  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
      loadTemplates();
    }
    // Set initial page loading to false after a short delay
    const timer = setTimeout(() => {
      setInitialPageLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [user, loadWhatsAppInstances, loadTemplates]);

  useEffect(() => {
    if (selectedInstance) {
      loadPersonalities();
      loadUsageAnalytics();
    }
  }, [selectedInstance, loadPersonalities, loadUsageAnalytics]);

  // Show initial loading state
  if (initialPageLoading) {
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
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('aiPersonalities.loadingTitle')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('aiPersonalities.loadingDescription')}
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

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {t('aiPersonalities.title')}
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  {t('aiPersonalities.description')}
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
                {t('aiPersonalities.chooseWhatsappNumber')}
              </h2>
            </div>

            <Select
              value={selectedInstance}
              onValueChange={(value) => setSelectedInstance(value)}
              disabled={isLoading || instances.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('aiPersonalities.selectWhatsappNumber')} />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none">
                    {t('aiPersonalities.noConnectedNumbers')}
                  </SelectItem>
                ) : (
                  instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center justify-between w-full gap-x-2">
                        <span>{instance.instance_name}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                          {t('aiPersonalities.connected')}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedInstance && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="personalities">{t('aiPersonalities.myPersonalities')}</TabsTrigger>
                  <TabsTrigger value="templates">{t('aiPersonalities.addFromTemplates')}</TabsTrigger>
                </TabsList>

                {/* Personalities Management Tab */}
                <TabsContent value="personalities" className="space-y-6 mt-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                    <div className="flex items-center gap-2 mb-0">
                      <Users className="h-5 w-5 text-blue-600" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('aiPersonalities.manageAiPersonalities')}</h2>
                    </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{t('aiPersonalities.manageDescription')}</p>
                    </div>
                    <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('aiPersonalities.createPersonality')}
                    </Button>
                  </div>

                  {/* Personalities Grid */}
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {personalities.map((personality) => (
                      <div key={personality.id} className="flex">
                        <PersonalityCard
                          personality={personality}
                          onEdit={openEditDialog}
                          onDelete={deletePersonality}
                          intentCategoriesMap={intentCategoriesMap}
                          t={t}
                        />
                      </div>
                    ))}
                  </div>

                  {personalities.length === 0 && !isLoading && (
                    <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
                      <div>
                        <h3 className="text-lg font-semibold">{t('aiPersonalities.noPersonalitiesYet')}</h3>
                        <p className="text-muted-foreground">
                          {t('aiPersonalities.createFirstPersonality')}
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700">
                          <Plus className="mr-2 h-4 w-4" />
                          {t('aiPersonalities.createPersonality')}
                        </Button>
                        <Button variant="outline" onClick={() => setActiveTab('templates')}>
                          <FileText className="mr-2 h-4 w-4" />
                          {t('aiPersonalities.browseTemplates')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                    </Card>
                  )}
                </TabsContent>
                
                {/* Templates Tab */}
                <TabsContent value="templates" className="space-y-6 mt-6">
                  <div>
                    <div className="flex items-center gap-2 mb-0">
                      <Bot className="h-5 w-5 text-blue-600" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('aiPersonalities.personalityTemplates')}</h2>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('aiPersonalities.templatesDescription')}</p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map((template) => (
                      <div key={template.id} className="flex">
                        <TemplateCard
                          template={template}
                          onClone={cloneTemplate}
                          intentCategoriesMap={intentCategoriesMap}
                          isLoading={isLoading}
                          t={t}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Personality Dialog */}
      <Dialog open={isPersonalityDialogOpen} onOpenChange={setIsPersonalityDialogOpen}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl h-[85vh] p-0 border-none flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-0 flex-shrink-0">
            <DialogTitle className="text-left">
              {editingPersonality ? t('aiPersonalities.editAiPersonality') : t('aiPersonalities.createAiPersonality')}
            </DialogTitle>
            <DialogDescription className="text-left">
              {t('aiPersonalities.configurePersonality')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('aiPersonalities.personalityName')}</Label>
                <Input
                  id="name"
                  value={personalityForm.name}
                  onChange={(e) => setPersonalityForm({...personalityForm, name: e.target.value})}
                  placeholder={t('aiPersonalities.personalityNamePlaceholder')}
                  className="text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('aiPersonalities.description')}</Label>
                <Input
                  id="description"
                  value={personalityForm.description}
                  onChange={(e) => setPersonalityForm({...personalityForm, description: e.target.value})}
                  placeholder={t('aiPersonalities.descriptionPlaceholder')}
                  className="text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Intent Categories */}
            <div className="space-y-0">
              <Label className="text-base font-semibold">{t('aiPersonalities.intentCategories')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('aiPersonalities.intentCategoriesDescription')}
              </p>
              <div className="grid grid-cols-1 gap-2 pt-4">
                {intentCategories.map(category => (
                  <div key={category.key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={category.key}
                      checked={personalityForm.intent_categories.includes(category.key)}
                      onChange={(e) => handleIntentCategoryChange(category.key, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor={category.key} className="text-sm">
                      {category.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="system-prompt">{t('aiPersonalities.systemPrompt')}</Label>
                <Button variant="outline" size="sm" onClick={openPromptWizard}>
                  <Lightbulb className="mr-2 h-4 w-4" />
                  {t('aiPersonalities.autoGeneratePrompt')}
                </Button>
              </div>
              <LanguageAwareTextarea
                id="system-prompt"
                value={personalityForm.system_prompt}
                onChange={(e) => setPersonalityForm({...personalityForm, system_prompt: e.target.value})}
                rows={8}
                placeholder={t('aiPersonalities.systemPromptPlaceholder')}
                className="resize-y text-sm sm:text-base"
              />
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">{t('aiPersonalities.temperature')} ({personalityForm.temperature})</Label>
                <input
                  type="range"
                  id="temperature"
                  min="0"
                  max="1"
                  step="0.1"
                  value={personalityForm.temperature}
                  onChange={(e) => setPersonalityForm({...personalityForm, temperature: parseFloat(e.target.value)})}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {t('aiPersonalities.temperatureDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">{t('aiPersonalities.priority')}</Label>
                <Input
                  type="number"
                  id="priority"
                  min="1"
                  max="10"
                  value={personalityForm.priority}
                  onChange={(e) => setPersonalityForm({...personalityForm, priority: parseInt(e.target.value)})}
                  className="text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Status Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('aiPersonalities.active')}</Label>
                  <p className="text-sm text-muted-foreground">{t('aiPersonalities.activeDescription')}</p>
                </div>
                <Switch
                  checked={personalityForm.is_active}
                  onCheckedChange={(checked) => setPersonalityForm({...personalityForm, is_active: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('aiPersonalities.defaultPersonality')}</Label>
                  <p className="text-sm text-muted-foreground">{t('aiPersonalities.defaultPersonalityDescription')}</p>
                </div>
                <Switch
                  checked={personalityForm.is_default}
                  onCheckedChange={(checked) => setPersonalityForm({...personalityForm, is_default: checked})}
                />
              </div>
            </div>
            </div>
          </div>
          
          <DialogFooter className="px-4 py-3 flex-shrink-0 border-t border-border bg-white dark:bg-slate-900">
            <Button variant="outline" onClick={() => setIsPersonalityDialogOpen(false)}>
              {t('aiPersonalities.cancel')}
            </Button>
            <Button
              onClick={savePersonality}
              disabled={isLoading || !personalityForm.name || !personalityForm.system_prompt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('aiPersonalities.saving')}
                </>
              ) : (
                editingPersonality ? t('aiPersonalities.updatePersonality') : t('aiPersonalities.createPersonality')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Generate Prompt Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl py-6 px-6">
        <DialogHeader>
          <DialogTitle className="text-left font-semibold">{t('aiPersonalities.smartPromptWizard')}</DialogTitle>
          <DialogDescription className="text-left">
            {t('aiPersonalities.wizardDescription')}
          </DialogDescription>
          {promptStats && (
            <div className="mt-2 text-sm">
              <div className="flex justify-between items-center">
                <span>
                  {promptStats.remaining} {t('aiPersonalities.generationsRemaining')}
                </span>
                <span className="text-muted-foreground">
                  ({promptStats.used}/{promptStats.limit} {t('aiPersonalities.usedOf')})
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
        
        {/* Progress Indicator */}
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
        
        {/* Step Content */}
        <div className="min-h-[200px] sm:min-h-[250px] py-2 sm:py-4 overflow-y-auto max-h-[50vh] sm:max-h-[60vh]">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
        </div>
        
        {/* Navigation Footer */}
        <DialogFooter className="pt-4 border-t">
          <div className="flex flex-col sm:flex-row sm:justify-between w-full gap-2 sm:gap-3">
            <div className="flex gap-2 w-full sm:w-auto order-2 sm:order-1">
              <Button
                variant="outline"
                onClick={() => setPromptDialogOpen(false)}
                className="flex-1 sm:flex-none text-xs sm:text-sm px-3 py-2"
              >
                {t('aiPersonalities.cancel')}
              </Button>
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  onClick={prevStep}
                  className="flex items-center justify-center gap-1 flex-1 sm:flex-none text-xs sm:text-sm px-3 py-2"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{t('aiPersonalities.previous')}</span>
                  <span className="sm:hidden">{t('aiPersonalities.back')}</span>
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
                  <span>{t('aiPersonalities.next')}</span>
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
                      <span>{t('aiPersonalities.generating')}</span>
                    </>
                  ) : promptStats?.remaining === 0 ? (
                    <span>{t('aiPersonalities.limitReached')}</span>
                  ) : (
                    <>
                      <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{t('aiPersonalities.generatePrompt')}</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
});

export default AIPersonalities;