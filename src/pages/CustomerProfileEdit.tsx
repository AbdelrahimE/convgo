import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  User,
  Mail,
  Building2,
  Target,
  Heart,
  Clock,
  TrendingUp,
  MessageSquare,
  Save,
  X,
  ArrowLeft,
  Phone,
  ExternalLink,
  Calendar,
  Bot
} from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateCustomerProfile, useCustomerProfile, type CustomerProfileUpdate } from '@/hooks/use-customer-profiles';
import type { CustomerProfile } from '@/components/customer/CustomerProfileCard';
import logger from '@/utils/logger';
import { formatDistanceToNow } from 'date-fns';

interface EditFormData {
  name: string;
  email: string;
  company: string;
  customer_stage: 'new' | 'interested' | 'customer' | 'loyal';
  tags: string[];
  conversation_summary: string;
  customer_intent: 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison' | 'unset';
  customer_mood: 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused' | 'unset';
  urgency_level: 'urgent' | 'high' | 'normal' | 'low' | 'unset';
  communication_style: 'formal' | 'friendly' | 'direct' | 'detailed' | 'unset';
  journey_stage: 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer' | 'unset';
}

const CUSTOMER_STAGES = [
  { value: 'new', label: 'New Customer' },
  { value: 'interested', label: 'Interested' },
  { value: 'customer', label: 'Customer' },
  { value: 'loyal', label: 'Loyal Customer' }
] as const;

const CUSTOMER_INTENTS = [
  { value: 'unset', label: 'Not Set' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'support', label: 'Support' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'comparison', label: 'Comparison' }
] as const;

const CUSTOMER_MOODS = [
  { value: 'unset', label: 'Not Set' },
  { value: 'happy', label: 'Happy' },
  { value: 'excited', label: 'Excited' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'frustrated', label: 'Frustrated' },
  { value: 'confused', label: 'Confused' }
] as const;

const URGENCY_LEVELS = [
  { value: 'unset', label: 'Not Set' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
] as const;

const COMMUNICATION_STYLES = [
  { value: 'unset', label: 'Not Set' },
  { value: 'formal', label: 'Formal' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'detailed', label: 'Detailed' }
] as const;

const JOURNEY_STAGES = [
  { value: 'unset', label: 'Not Set' },
  { value: 'first_time', label: 'First Time' },
  { value: 'researching', label: 'Researching' },
  { value: 'ready_to_buy', label: 'Ready to Buy' },
  { value: 'existing_customer', label: 'Existing Customer' }
] as const;

const openWhatsApp = (phoneNumber: string) => {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleanNumber}`, '_blank');
};

export const CustomerProfileEdit = () => {
  const { t } = useTranslation();
  const { instanceId, phoneNumber } = useParams<{ instanceId: string; phoneNumber: string }>();
  const navigate = useNavigate();
  const updateProfileMutation = useUpdateCustomerProfile();

  // Fetch the customer profile
  const { data: profile, isLoading, error } = useCustomerProfile(instanceId, phoneNumber);

  // Translated constants
  const CUSTOMER_STAGES_TRANSLATED = [
    { value: 'new', label: t('customerProfileEdit.newCustomer') },
    { value: 'interested', label: t('customerProfileEdit.interested') },
    { value: 'customer', label: t('customerProfileEdit.customer') },
    { value: 'loyal', label: t('customerProfileEdit.loyalCustomer') }
  ] as const;

  const CUSTOMER_INTENTS_TRANSLATED = [
    { value: 'unset', label: t('customerProfileEdit.notSet') },
    { value: 'purchase', label: t('customerProfileEdit.purchase') },
    { value: 'inquiry', label: t('customerProfileEdit.inquiry') },
    { value: 'support', label: t('customerProfileEdit.support') },
    { value: 'complaint', label: t('customerProfileEdit.complaint') },
    { value: 'comparison', label: t('customerProfileEdit.comparison') }
  ] as const;

  const CUSTOMER_MOODS_TRANSLATED = [
    { value: 'unset', label: t('customerProfileEdit.notSet') },
    { value: 'happy', label: t('customerProfileEdit.happy') },
    { value: 'excited', label: t('customerProfileEdit.excited') },
    { value: 'neutral', label: t('customerProfileEdit.neutral') },
    { value: 'frustrated', label: t('customerProfileEdit.frustrated') },
    { value: 'confused', label: t('customerProfileEdit.confused') }
  ] as const;

  const URGENCY_LEVELS_TRANSLATED = [
    { value: 'unset', label: t('customerProfileEdit.notSet') },
    { value: 'low', label: t('customerProfileEdit.low') },
    { value: 'normal', label: t('customerProfileEdit.normal') },
    { value: 'high', label: t('customerProfileEdit.high') },
    { value: 'urgent', label: t('customerProfileEdit.urgent') }
  ] as const;

  const COMMUNICATION_STYLES_TRANSLATED = [
    { value: 'unset', label: t('customerProfileEdit.notSet') },
    { value: 'formal', label: t('customerProfileEdit.formal') },
    { value: 'friendly', label: t('customerProfileEdit.friendly') },
    { value: 'direct', label: t('customerProfileEdit.direct') },
    { value: 'detailed', label: t('customerProfileEdit.detailed') }
  ] as const;

  const JOURNEY_STAGES_TRANSLATED = [
    { value: 'unset', label: t('customerProfileEdit.notSet') },
    { value: 'first_time', label: t('customerProfileEdit.firstTime') },
    { value: 'researching', label: t('customerProfileEdit.researching') },
    { value: 'ready_to_buy', label: t('customerProfileEdit.readyToBuy') },
    { value: 'existing_customer', label: t('customerProfileEdit.existingCustomer') }
  ] as const;
  
  const [formData, setFormData] = useState<EditFormData>({
    name: '',
    email: '',
    company: '',
    customer_stage: 'new',
    tags: [],
    conversation_summary: '',
    customer_intent: 'unset',
    customer_mood: 'unset',
    urgency_level: 'unset',
    communication_style: 'unset',
    journey_stage: 'unset'
  });

  // Initialize form data when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        company: profile.company || '',
        customer_stage: profile.customer_stage,
        tags: profile.tags || [],
        conversation_summary: profile.conversation_summary || '',
        customer_intent: profile.customer_intent || 'unset',
        customer_mood: profile.customer_mood || 'unset',
        urgency_level: profile.urgency_level || 'unset',
        communication_style: profile.communication_style || 'unset',
        journey_stage: profile.journey_stage || 'unset'
      });
    }
  }, [profile]);

  // Update form field
  const updateField = useCallback(<K extends keyof EditFormData>(
    field: K,
    value: EditFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Validate form data
  const validateForm = useCallback((): string | null => {
    if (!formData.name.trim()) {
      return t('customerProfileEdit.nameRequired');
    }

    if (formData.email && !formData.email.includes('@')) {
      return t('customerProfileEdit.invalidEmail');
    }

    return null;
  }, [formData, t]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!profile || !instanceId || !phoneNumber) return;

    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      const updates: CustomerProfileUpdate = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        company: formData.company.trim() || null,
        customer_stage: formData.customer_stage,
        tags: formData.tags,
        conversation_summary: formData.conversation_summary.trim() || null,
        customer_intent: formData.customer_intent === 'unset' ? null : formData.customer_intent,
        customer_mood: formData.customer_mood === 'unset' ? null : formData.customer_mood,
        urgency_level: formData.urgency_level === 'unset' ? null : formData.urgency_level,
        communication_style: formData.communication_style === 'unset' ? null : formData.communication_style,
        journey_stage: formData.journey_stage === 'unset' ? null : formData.journey_stage
      };

      await updateProfileMutation.mutateAsync({
        instanceId: instanceId,
        phoneNumber: phoneNumber,
        updates
      });

      toast.success(t('customerProfileEdit.updateSuccess'));
      navigate('/customer-profiles');
    } catch (error) {
      logger.error('Error updating customer profile:', error);
      toast.error(t('customerProfileEdit.updateError'));
    }
  }, [
    profile,
    instanceId,
    phoneNumber,
    formData,
    validateForm,
    updateProfileMutation,
    navigate
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    navigate('/customer-profiles');
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">{t('customerProfileEdit.loadingProfile')}</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t('customerProfileEdit.profileNotFound')}
          </h1>
          <p className="text-muted-foreground mb-4">
            {t('customerProfileEdit.profileNotFoundDescription')}
          </p>
          <Button onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('customerProfileEdit.backToProfiles')}
          </Button>
        </div>
      </div>
    );
  }

  const displayName = profile.name || `Customer ${profile.phone_number.slice(-4)}`;
  const lastInteraction = profile.last_interaction ? 
    formatDistanceToNow(new Date(profile.last_interaction), { addSuffix: true }) : 
    'Never';

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  {t('customerProfileEdit.title')}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                className="bg-green-500 hover:bg-green-600 text-white"
                onClick={() => openWhatsApp(profile.phone_number)}
              >
                <ExternalLink className="h-4 w-4" />
                {t('customerProfileEdit.whatsapp')}
              </Button>
              <Button
                variant="default"
                onClick={handleCancel}
                disabled={updateProfileMutation.isPending}
                className="text-gray-800 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 border-gray-300 border"
              >
                <X className="h-4 w-4" />
                {t('customerProfileEdit.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateProfileMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('customerProfileEdit.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
          {/* Basic Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('customerProfileEdit.basicInformation')}
              </CardTitle>
              <CardDescription>
                {t('customerProfileEdit.basicInformationDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('customerProfileEdit.customerNameRequired')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder={t('customerProfileEdit.customerNamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('customerProfileEdit.emailAddress')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder={t('customerProfileEdit.emailPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">{t('customerProfileEdit.company')}</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => updateField('company', e.target.value)}
                    placeholder={t('customerProfileEdit.companyPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_stage">{t('customerProfileEdit.customerStage')}</Label>
                  <Select
                    value={formData.customer_stage}
                    onValueChange={(value) => updateField('customer_stage', value as 'new' | 'interested' | 'customer' | 'loyal')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectStage')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_STAGES_TRANSLATED.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">{t('customerProfileEdit.tags')}</Label>
                <TagInput
                  value={formData.tags}
                  onChange={(tags) => updateField('tags', tags)}
                  placeholder={t('customerProfileEdit.tagsPlaceholder')}
                  maxTags={10}
                />
                <p className="text-xs text-muted-foreground">
                  {t('customerProfileEdit.tagsDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t('customerProfileEdit.aiInsights')}
              </CardTitle>
              <CardDescription>
                {t('customerProfileEdit.aiInsightsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer_intent">{t('customerProfileEdit.customerIntent')}</Label>
                  <Select
                    value={formData.customer_intent}
                    onValueChange={(value) => updateField('customer_intent', value as 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison' | 'unset')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectIntent')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_INTENTS_TRANSLATED.map((intent) => (
                        <SelectItem key={intent.value} value={intent.value}>
                          {intent.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_mood">{t('customerProfileEdit.customerMood')}</Label>
                  <Select
                    value={formData.customer_mood}
                    onValueChange={(value) => updateField('customer_mood', value as 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused' | 'unset')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectMood')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_MOODS_TRANSLATED.map((mood) => (
                        <SelectItem key={mood.value} value={mood.value}>
                          {mood.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="urgency_level">{t('customerProfileEdit.urgencyLevel')}</Label>
                  <Select
                    value={formData.urgency_level}
                    onValueChange={(value) => updateField('urgency_level', value as 'urgent' | 'high' | 'normal' | 'low' | 'unset')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectUrgency')} />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCY_LEVELS_TRANSLATED.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="communication_style">{t('customerProfileEdit.communicationStyle')}</Label>
                  <Select
                    value={formData.communication_style}
                    onValueChange={(value) => updateField('communication_style', value as 'formal' | 'friendly' | 'direct' | 'detailed' | 'unset')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectStyle')} />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_STYLES_TRANSLATED.map((style) => (
                        <SelectItem key={style.value} value={style.value}>
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="journey_stage">{t('customerProfileEdit.journeyStage')}</Label>
                  <Select
                    value={formData.journey_stage}
                    onValueChange={(value) => updateField('journey_stage', value as 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer' | 'unset')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customerProfileEdit.selectJourneyStage')} />
                    </SelectTrigger>
                    <SelectContent>
                      {JOURNEY_STAGES_TRANSLATED.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conversation Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t('customerProfileEdit.conversationSummary')}
              </CardTitle>
              <CardDescription>
                {t('customerProfileEdit.conversationSummaryDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="conversation_summary">{t('customerProfileEdit.summary')}</Label>
                <LanguageAwareTextarea
                  id="conversation_summary"
                  value={formData.conversation_summary}
                  onChange={(e) => updateField('conversation_summary', e.target.value)}
                  placeholder={t('customerProfileEdit.summaryPlaceholder')}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {t('customerProfileEdit.summaryDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Customer Statistics Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('customerProfileEdit.statisticsAndActivity')}
              </CardTitle>
              <CardDescription>
                {t('customerProfileEdit.statisticsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Messages */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <h4 className="text-sm font-medium">{t('customerProfileEdit.totalMessages')}</h4>
                      <MessageSquare className="h-4 w-4 text-orange-600" />
                    </div>
                    <div className="text-2xl font-bold">{profile.total_messages}</div>
                    <p className="text-xs text-muted-foreground">{t('customerProfileEdit.messagesExchanged')}</p>
                  </div>
                </div>

                {/* AI Interactions */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <h4 className="text-sm font-medium">{t('customerProfileEdit.aiInteractions')}</h4>
                      <Bot className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="text-2xl font-bold">{profile.ai_interactions}</div>
                    <p className="text-xs text-muted-foreground">{t('customerProfileEdit.aiConversations')}</p>
                  </div>
                </div>

                {/* First Contact */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <h4 className="text-sm font-medium">{t('customerProfileEdit.firstContact')}</h4>
                      <Calendar className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="text-lg font-bold">{new Date(profile.first_interaction).toLocaleDateString()}</div>
                    <p className="text-xs text-muted-foreground">{t('customerProfileEdit.initialInteraction')}</p>
                  </div>
                </div>

                {/* Last Contact */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <h4 className="text-sm font-medium">{t('customerProfileEdit.lastContact')}</h4>
                      <Clock className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="text-lg font-bold">{lastInteraction}</div>
                    <p className="text-xs text-muted-foreground">{t('customerProfileEdit.recentActivity')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};