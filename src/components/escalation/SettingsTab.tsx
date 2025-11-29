import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { TagInput } from '@/components/ui/tag-input';
import { Plus, Trash2, Headset, User, Cog } from 'lucide-react';
import { handlePhoneNumberInput, isValidPhoneNumberLength } from '@/utils/phoneNumber';
import { useTranslation } from 'react-i18next';
import {
  useSupportNumbers,
  useAddSupportNumber,
  useToggleNumberStatus,
  useDeleteSupportNumber,
  useUpdateInstanceSettings,
  useSaveInstanceSettings,
  InstanceSettings
} from '@/hooks/use-escalation-queries';
import { useAuth } from '@/contexts/AuthContext';

interface SettingsTabProps {
  selectedInstance: string;
  instances: InstanceSettings[];
}

export const SettingsTab = React.memo(({ selectedInstance, instances }: SettingsTabProps) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [newNumber, setNewNumber] = useState('');
  const [phoneValidationError, setPhoneValidationError] = useState('');
  const [localSettings, setLocalSettings] = useState<{
    escalation_message: string;
    escalated_conversation_message: string;
    escalation_keywords: string[];
    custom_escalation_instructions: string;
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Queries and mutations (instance-based)
  const { data: supportNumbers = [] } = useSupportNumbers(selectedInstance);
  const addSupportNumberMutation = useAddSupportNumber();
  const toggleNumberStatusMutation = useToggleNumberStatus();
  const deleteSupportNumberMutation = useDeleteSupportNumber();
  const updateInstanceSettingsMutation = useUpdateInstanceSettings();
  const saveInstanceSettingsMutation = useSaveInstanceSettings();

  // Get current instance
  const currentInstance = useMemo(
    () => instances.find(i => i.id === selectedInstance),
    [instances, selectedInstance]
  );

  // Update local settings when selectedInstance changes
  useEffect(() => {
    if (currentInstance) {
      setLocalSettings({
        escalation_message: currentInstance.escalation_message,
        escalated_conversation_message: currentInstance.escalated_conversation_message,
        escalation_keywords: currentInstance.escalation_keywords || [],
        custom_escalation_instructions: currentInstance.custom_escalation_instructions || ''
      });
      setHasUnsavedChanges(false);
    }
  }, [currentInstance]);

  // Handle phone number input change with automatic cleaning
  const handlePhoneNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanedValue = handlePhoneNumberInput(e.target.value);
    setNewNumber(cleanedValue);
    
    // Clear validation error when user starts typing
    if (phoneValidationError) {
      setPhoneValidationError('');
    }
  }, [phoneValidationError]);

  // Handle adding support number
  const handleAddSupportNumber = useCallback(async () => {
    if (!newNumber.trim() || !selectedInstance) return;

    // Validate phone number length (11-15 digits)
    if (!isValidPhoneNumberLength(newNumber)) {
      const cleanedLength = newNumber.replace(/[^\d]/g, '').length;
      if (cleanedLength === 0) {
        setPhoneValidationError(t('escalation.phoneValidationEmpty'));
      } else if (cleanedLength < 11) {
        setPhoneValidationError(t('escalation.phoneValidationTooShort'));
      } else if (cleanedLength > 15) {
        setPhoneValidationError(t('escalation.phoneValidationTooLong'));
      }
      return;
    }

    addSupportNumberMutation.mutate({
      instanceId: selectedInstance,
      whatsappNumber: newNumber.trim()
    }, {
      onSuccess: () => {
        setNewNumber('');
        setPhoneValidationError('');
      }
    });
  }, [newNumber, selectedInstance, addSupportNumberMutation, t]);

  // Handle toggle number status
  const handleToggleNumberStatus = useCallback((id: string, currentStatus: boolean) => {
    toggleNumberStatusMutation.mutate({ id, currentStatus });
  }, [toggleNumberStatusMutation]);

  // Handle delete number
  const handleDeleteNumber = useCallback((id: string) => {
    deleteSupportNumberMutation.mutate(id);
  }, [deleteSupportNumberMutation]);

  // Update local settings without saving to database
  const updateLocalSettings = useCallback((field: keyof typeof localSettings, value: any) => {
    if (!localSettings) return;
    
    setLocalSettings(prev => prev ? {
      ...prev,
      [field]: value
    } : null);
    setHasUnsavedChanges(true);
  }, [localSettings]);

  // Update instance settings immediately
  const updateInstanceSettings = useCallback((field: string, value: any) => {
    if (!selectedInstance) return;

    updateInstanceSettingsMutation.mutate({
      instanceId: selectedInstance,
      field,
      value
    });
  }, [selectedInstance, updateInstanceSettingsMutation]);

  // Save all settings at once
  const saveInstanceSettings = useCallback(() => {
    if (!selectedInstance || !localSettings) return;

    saveInstanceSettingsMutation.mutate({
      instanceId: selectedInstance,
      settings: localSettings
    }, {
      onSuccess: () => {
        setHasUnsavedChanges(false);
      }
    });
  }, [selectedInstance, localSettings, saveInstanceSettingsMutation]);

  const loading = addSupportNumberMutation.isPending || 
                 toggleNumberStatusMutation.isPending || 
                 deleteSupportNumberMutation.isPending ||
                 updateInstanceSettingsMutation.isPending ||
                 saveInstanceSettingsMutation.isPending;

  // Don't render Support Team Numbers section if no instance is selected
  if (!selectedInstance) {
    return (
      <div className="text-center py-12 text-slate-600 dark:text-slate-400">
        <Headset className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">{t('escalation.selectInstanceFirst')}</p>
        <p className="text-sm mt-2">{t('escalation.selectInstanceDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Support Team Numbers Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Headset className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('escalation.supportTeamNumbers')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t('escalation.supportTeamDescription')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder={t('escalation.enterWhatsappNumber')}
                  value={newNumber}
                  onChange={handlePhoneNumberChange}
                  className={`flex-1 text-xs ${phoneValidationError ? 'border-red-500 focus:ring-red-500' : ''}`}
                  type="text"
                  inputMode="tel"
                />
                <Button
                  onClick={handleAddSupportNumber}
                  disabled={loading || !newNumber.trim() || !isValidPhoneNumberLength(newNumber)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('escalation.add')}
                </Button>
              </div>
              {phoneValidationError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {phoneValidationError}
                </p>
              )}
            </div>

            {supportNumbers.length === 0 ? (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <Headset className="h-12 w-12 mx-auto mb-2 opacity-50 text-slate-400 dark:text-slate-500" />
                <p className="text-slate-600 dark:text-slate-400">{t('escalation.noSupportNumbers')}</p>
                <p className="text-sm mt-1 text-slate-500 dark:text-slate-500">{t('escalation.addSupportNumbersPrompt')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {supportNumbers.map((number) => (
                  <div
                    key={number.id}
                    className="flex items-center justify-between p-2 py-1 bg-blue-50 dark:bg-blue-800 rounded-lg border border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                      <span className="text-base font-semibold text-blue-900 dark:text-blue-100">{number.whatsapp_number}</span>
                      {!number.is_active && (
                        <span className="text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-lg">
                          {t('escalation.disabled')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={number.is_active}
                        onCheckedChange={() => handleToggleNumberStatus(number.id, number.is_active)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteNumber(number.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instance Settings Section */}
      {selectedInstance && currentInstance && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t('escalation.escalationSettings')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {t('escalation.escalationSettingsDescription')}
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">{t('escalation.enableEscalationSystem')}</Label>
                  <p className="text-sm text-gray-500">
                    {t('escalation.enableEscalationDescription')}
                  </p>
                </div>
                <Switch
                  checked={currentInstance.escalation_enabled}
                  onCheckedChange={(checked) => updateInstanceSettings('escalation_enabled', checked)}
                />
              </div>

              {/* Escalation Detection Methods */}
              {currentInstance.escalation_enabled && (
                <div className="space-y-4 border border-blue-300 rounded-lg p-4 bg-blue-50">
                  <div className="space-y-0.5">
                    <Label className="text-base text-blue-900 font-semibold">{t('escalation.chooseDetectionMethod')}</Label>
                  </div>

                  {/* Smart AI Detection */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2 text-blue-900">
                        {t('escalation.smartAiDetection')}
                      </Label>
                      <p className="text-xs text-blue-600">
                        {t('escalation.smartAiDetectionDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={currentInstance.smart_escalation_enabled}
                      onCheckedChange={(checked) =>
                        updateInstanceSettings('smart_escalation_enabled', checked)
                      }
                    />
                  </div>

                  {/* Keyword Detection */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2 text-blue-900">
                        {t('escalation.keywordDetection')}
                      </Label>
                      <p className="text-xs text-blue-600">
                        {t('escalation.keywordDetectionDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={currentInstance.keyword_escalation_enabled}
                      onCheckedChange={(checked) =>
                        updateInstanceSettings('keyword_escalation_enabled', checked)
                      }
                    />
                  </div>

                  {/* Custom AI Instructions */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2 text-blue-900">
                        {t('escalation.customAiDetection')}
                      </Label>
                      <p className="text-xs text-blue-600">
                        {t('escalation.customAiDetectionDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={currentInstance.custom_escalation_enabled}
                      onCheckedChange={(checked) =>
                        updateInstanceSettings('custom_escalation_enabled', checked)
                      }
                    />
                  </div>
                </div>
              )}

              {/* Escalation Keywords - only show if keyword escalation is enabled */}
              {currentInstance.keyword_escalation_enabled && (
                <div>
                  <Label>{t('escalation.escalationKeywords')}</Label>
                  <TagInput
                    value={localSettings?.escalation_keywords || currentInstance.escalation_keywords || []}
                    onChange={(keywords) => updateLocalSettings('escalation_keywords', keywords)}
                    placeholder={t('escalation.typeKeywordPlaceholder')}
                    className="mt-1"
                    disabled={loading}
                    maxTags={30}
                  />
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t('escalation.escalationKeywordsDescription')}
                  </p>
                </div>
              )}

              {/* Custom Escalation Instructions - only show if custom escalation is enabled */}
              {currentInstance.custom_escalation_enabled && (
                <div>
                  <Label>{t('escalation.customEscalationInstructions')}</Label>
                  <LanguageAwareTextarea
                    value={localSettings?.custom_escalation_instructions || currentInstance.custom_escalation_instructions || ''}
                    onChange={(e) => updateLocalSettings('custom_escalation_instructions', e.target.value)}
                    className="mt-1"
                    rows={5}
                    autoExpand={false}
                    placeholder={t('escalation.customEscalationPlaceholder')}
                    disabled={loading}
                  />
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t('escalation.customEscalationInstructionsDescription')}
                  </p>
                </div>
              )}

              <div>
                <Label>{t('escalation.escalationMessage')}</Label>
                <LanguageAwareTextarea
                  value={localSettings?.escalation_message || currentInstance.escalation_message}
                  onChange={(e) => updateLocalSettings('escalation_message', e.target.value)}
                  className="mt-1"
                  rows={3}
                  autoExpand={false}
                  placeholder={t('escalation.escalationMessagePlaceholder')}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('escalation.escalationMessageDescription')}
                </p>
              </div>

              <div>
                <Label>{t('escalation.escalatedConversationMessage')}</Label>
                <LanguageAwareTextarea
                  value={localSettings?.escalated_conversation_message || currentInstance.escalated_conversation_message}
                  onChange={(e) => updateLocalSettings('escalated_conversation_message', e.target.value)}
                  className="mt-1"
                  rows={3}
                  autoExpand={false}
                  placeholder={t('escalation.escalatedConversationMessagePlaceholder')}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('escalation.escalatedConversationMessageDescription')}
                </p>
              </div>

              {/* Save Settings Button */}
              <div className="flex justify-end pt-0">
                <Button
                  onClick={saveInstanceSettings}
                  disabled={loading || !hasUnsavedChanges}
                  className="min-w-32"
                >
                  {loading ? t('escalation.saving') : t('escalation.saveSettings')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});