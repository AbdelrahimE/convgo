import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Save, 
  Globe,
  Zap,
  Code,
  MessageSquare,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle,
  Reply,
  ArrowLeft
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import logger from '@/utils/logger';

interface ExternalAction {
  id?: string;
  user_id?: string;
  whatsapp_instance_id?: string;
  action_name: string;
  display_name: string;
  training_examples: Array<{
    text: string;
    language: string;
  }>;
  webhook_url: string;
  http_method: string;
  headers: Record<string, any>;
  payload_template: Record<string, any>;
  variable_prompts: Record<string, string>;
  confidence_threshold: number;
  is_active: boolean;
  retry_attempts: number;
  timeout_seconds: number;
  // External Actions V2 fields
  response_type?: 'none' | 'simple_confirmation' | 'custom_message' | 'wait_for_webhook';
  confirmation_message?: string;
  wait_for_response?: boolean;
  response_timeout_seconds?: number;
  response_language?: 'ar' | 'en' | 'fr' | 'es' | 'de';
}

interface ExternalActionFormProps {
  mode: 'create' | 'edit';
  whatsappInstanceId?: string;
  existingAction?: ExternalAction | null;
}

const STEPS = [
  { id: 'basic', title: 'Basic Info', icon: MessageSquare },
  { id: 'training', title: 'Training Examples', icon: Globe },
  { id: 'webhook', title: 'Webhook Config', icon: Zap },
  { id: 'payload', title: 'Payload & Variables', icon: Code },
  { id: 'settings', title: 'Settings', icon: Settings },
  { id: 'response', title: 'Response Configuration', icon: Reply }
];

const ExternalActionForm: React.FC<ExternalActionFormProps> = ({
  mode,
  whatsappInstanceId,
  existingAction
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState<ExternalAction>({
    action_name: '',
    display_name: '',
    training_examples: [],
    webhook_url: '',
    http_method: 'POST',
    headers: {},
    payload_template: {
      phone_number: '{{phone_number}}',
      message: '{{message}}',
      timestamp: '{{timestamp}}'
    },
    variable_prompts: {},
    confidence_threshold: 0.75,
    is_active: true,
    retry_attempts: 3,
    timeout_seconds: 30,
    // External Actions V2 defaults
    response_type: 'simple_confirmation',
    confirmation_message: '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
    wait_for_response: false,
    response_timeout_seconds: 30,
    response_language: 'ar'
  });

  // Initialize form with existing action data
  useEffect(() => {
    if (existingAction && mode === 'edit') {
      setFormData({
        action_name: existingAction.action_name,
        display_name: existingAction.display_name,
        training_examples: existingAction.training_examples || [],
        webhook_url: existingAction.webhook_url,
        http_method: existingAction.http_method || 'POST',
        headers: existingAction.headers || {},
        payload_template: existingAction.payload_template || {},
        variable_prompts: existingAction.variable_prompts || {},
        confidence_threshold: existingAction.confidence_threshold || 0.75,
        is_active: existingAction.is_active,
        retry_attempts: existingAction.retry_attempts || 3,
        timeout_seconds: existingAction.timeout_seconds || 30,
        // External Actions V2 fields with fallbacks
        response_type: existingAction.response_type || 'simple_confirmation',
        confirmation_message: existingAction.confirmation_message || '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
        wait_for_response: existingAction.wait_for_response || false,
        response_timeout_seconds: existingAction.response_timeout_seconds || 30,
        response_language: existingAction.response_language || 'ar'
      });
    }
  }, [existingAction, mode]);

  const handleBack = () => {
    navigate('/external-actions');
  };

  const handleCancel = () => {
    navigate('/external-actions');
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(Math.max(currentStep - 1, 0));
  };

  const addTrainingExample = () => {
    setFormData(prev => ({
      ...prev,
      training_examples: [...prev.training_examples, { text: '', language: 'en' }]
    }));
  };

  const updateTrainingExample = (index: number, field: 'text' | 'language', value: string) => {
    setFormData(prev => ({
      ...prev,
      training_examples: prev.training_examples.map((example, i) =>
        i === index ? { ...example, [field]: value } : example
      )
    }));
  };

  const removeTrainingExample = (index: number) => {
    setFormData(prev => ({
      ...prev,
      training_examples: prev.training_examples.filter((_, i) => i !== index)
    }));
  };

  const addVariable = () => {
    const variableName = `variable_${Object.keys(formData.variable_prompts).length + 1}`;
    setFormData(prev => ({
      ...prev,
      variable_prompts: {
        ...prev.variable_prompts,
        [variableName]: ''
      },
      payload_template: {
        ...prev.payload_template,
        [variableName]: `{{${variableName}}}`
      }
    }));
  };

  const updateVariable = (oldName: string, newName: string, prompt: string) => {
    setFormData(prev => {
      const newVariablePrompts = { ...prev.variable_prompts };
      const newPayloadTemplate = { ...prev.payload_template };

      // Remove old variable
      delete newVariablePrompts[oldName];
      if (newPayloadTemplate[oldName]) {
        delete newPayloadTemplate[oldName];
      }

      // Add new variable
      newVariablePrompts[newName] = prompt;
      newPayloadTemplate[newName] = `{{${newName}}}`;

      return {
        ...prev,
        variable_prompts: newVariablePrompts,
        payload_template: newPayloadTemplate
      };
    });
  };

  const removeVariable = (variableName: string) => {
    setFormData(prev => {
      const newVariablePrompts = { ...prev.variable_prompts };
      const newPayloadTemplate = { ...prev.payload_template };

      delete newVariablePrompts[variableName];
      delete newPayloadTemplate[variableName];

      return {
        ...prev,
        variable_prompts: newVariablePrompts,
        payload_template: newPayloadTemplate
      };
    });
  };

  const validateStep = (stepIndex: number): boolean => {
    const errors: Record<string, string> = {};

    switch (stepIndex) {
      case 0: // Basic Info
        if (!formData.display_name.trim()) {
          errors.display_name = 'Display name is required';
        }
        if (!formData.action_name.trim()) {
          errors.action_name = 'Action name is required';
        } else if (!/^[a-z0-9_]+$/.test(formData.action_name)) {
          errors.action_name = 'Action name must contain only lowercase letters, numbers, and underscores';
        }
        break;

      case 1: // Training Examples
        if (formData.training_examples.length < 3) {
          errors.training_examples = 'At least 3 training examples are required';
        }
        break;

      case 2: // Webhook Config
        if (!formData.webhook_url.trim()) {
          errors.webhook_url = 'Webhook URL is required';
        } else {
          try {
            new URL(formData.webhook_url);
          } catch {
            errors.webhook_url = 'Invalid URL format';
          }
        }
        break;

      case 3: // Payload & Variables
        if (Object.keys(formData.payload_template).length === 0) {
          errors.payload_template = 'Payload template cannot be empty';
        }
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setLoading(true);
    try {
      const actionData = {
        ...formData,
        user_id: user?.id,
        whatsapp_instance_id: whatsappInstanceId,
        updated_at: new Date().toISOString()
      };

      if (mode === 'edit' && existingAction?.id) {
        const { error } = await supabase
          .from('external_actions')
          .update(actionData)
          .eq('id', existingAction.id);

        if (error) throw error;
        toast.success('External action updated successfully');
      } else {
        const { error } = await supabase
          .from('external_actions')
          .insert([actionData]);

        if (error) throw error;
        toast.success('External action created successfully');
      }

      navigate('/external-actions');
    } catch (error) {
      logger.error('Error saving external action:', error);
      toast.error('Failed to save external action');
    } finally {
      setLoading(false);
    }
  };

  // Progress indicator
  const renderProgressIndicator = () => (
    <div className="mb-6">
      {/* Mobile Version - Numbers only */}
      <div className="block sm:hidden">
        <div className="flex items-center justify-center">
          <div className="flex items-center space-x-2">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex items-center justify-center">
                    <div className={`
                      flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors
                      ${isCompleted ? 'bg-green-600 border-green-600 text-white' : 
                        isCurrent ? 'bg-blue-600 border-blue-600 text-white' : 
                        'bg-gray-100 border-gray-300 text-gray-500'}
                    `}>
                      <span className="text-xs font-semibold">
                        {index + 1}
                      </span>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`w-3 h-0.5 mx-2 ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Version - Icons */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-center overflow-x-auto">
          <div className="flex items-center space-x-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex items-center justify-center">
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors
                      ${isCompleted ? 'bg-green-600 border-green-600 text-white' : 
                        isCurrent ? 'bg-blue-600 border-blue-600 text-white' : 
                        'bg-gray-100 border-gray-300 text-gray-500'}
                    `}>
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`w-8 h-0.5 mx-3 ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // Basic step content
  const renderBasicStep = () => (
    <div className="space-y-6">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Basic Info
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Set up the basic information for your external action
        </p>
      </div>
      <div>
        <Label htmlFor="display-name">Display Name *</Label>
        <Input
          id="display-name"
          value={formData.display_name}
          onChange={(e) => setFormData(prev => ({...prev, display_name: e.target.value}))}
          placeholder="e.g., Create Shopify Order"
          className={`mt-2 ${validationErrors.display_name ? 'border-red-500' : ''}`}
        />
        {validationErrors.display_name && (
          <p className="text-sm text-red-500 mt-1">{validationErrors.display_name}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Human-readable name shown in the interface
        </p>
      </div>

      <div>
        <Label htmlFor="action-name">Action Name *</Label>
        <Input
          id="action-name"
          value={formData.action_name}
          onChange={(e) => setFormData(prev => ({...prev, action_name: e.target.value}))}
          placeholder="e.g., create_shopify_order"
          className={`mt-2 ${validationErrors.action_name ? 'border-red-500' : ''}`}
        />
        {validationErrors.action_name && (
          <p className="text-sm text-red-500 mt-1">{validationErrors.action_name}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Internal identifier (lowercase letters, numbers, and underscores only)
        </p>
      </div>
    </div>
  );

  // Training step content
  const renderTrainingStep = () => (
    <div className="space-y-4">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Training Examples
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Provide examples of messages that should trigger this action
        </p>
      </div>
      {validationErrors.training_examples && (
        <p className="text-sm text-red-500 mt-1">{validationErrors.training_examples}</p>
      )}

      <div className="space-y-3">
        {formData.training_examples.map((example, index) => (
          <Card key={index} className="p-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <LanguageAwareTextarea
                  value={example.text}
                  onChange={(e) => updateTrainingExample(index, 'text', e.target.value)}
                  placeholder="I want to buy 3 iPhones"
                  className="min-h-[60px]"
                />
              </div>
              <div className="w-20">
                <Select
                  value={example.language}
                  onValueChange={(value) => updateTrainingExample(index, 'language', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">EN</SelectItem>
                    <SelectItem value="ar">AR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeTrainingExample(index)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
        
        <Button
          variant="outline"
          onClick={addTrainingExample}
          className="w-full gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Training Example
        </Button>
      </div>
    </div>
  );

  // Webhook step content
  const renderWebhookStep = () => (
    <div className="space-y-4">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Webhook Configuration
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure the webhook URL and request settings
        </p>
      </div>
      <div>
        <Label htmlFor="webhook_url">Webhook URL *</Label>
        <Input
          id="webhook_url"
          value={formData.webhook_url}
          onChange={(e) => setFormData(prev => ({ ...prev, webhook_url: e.target.value }))}
          placeholder="https://hooks.zapier.com/hooks/catch/123456/abcdef/"
          className={validationErrors.webhook_url ? 'border-red-500' : ''}
        />
        {validationErrors.webhook_url && (
          <p className="text-sm text-red-500 mt-1">{validationErrors.webhook_url}</p>
        )}
      </div>

      <div>
        <Label htmlFor="http_method">HTTP Method</Label>
        <Select
          value={formData.http_method}
          onValueChange={(value) => setFormData(prev => ({ ...prev, http_method: value }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="headers">Custom Headers (JSON)</Label>
        <LanguageAwareTextarea
          value={JSON.stringify(formData.headers, null, 2)}
          onChange={(e) => {
            try {
              const headers = JSON.parse(e.target.value || '{}');
              setFormData(prev => ({ ...prev, headers }));
            } catch {
              // Invalid JSON, don't update
            }
          }}
          placeholder='{"Authorization": "Bearer your-token"}'
          className="font-mono"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Optional custom headers for authentication or content type
        </p>
      </div>
    </div>
  );

  // Payload & Variables step content
  const renderPayloadStep = () => (
    <div className="space-y-4">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Payload & Variables
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Define data extraction variables and webhook payload structure
        </p>
      </div>
      <Tabs defaultValue="variables" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="template">Payload Template</TabsTrigger>
        </TabsList>

        <TabsContent value="variables" className="space-y-4">

          <div className="space-y-3">
            {Object.entries(formData.variable_prompts).map(([variableName, prompt]) => (
              <Card key={variableName} className="p-3">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input
                      value={variableName}
                      onChange={(e) => updateVariable(variableName, e.target.value, prompt)}
                      placeholder="product_name"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariable(variableName)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <LanguageAwareTextarea
                    value={prompt}
                    onChange={(e) => updateVariable(variableName, variableName, e.target.value)}
                    placeholder="Extract the product name from the message"
                    className="min-h-[60px]"
                  />
                </div>
              </Card>
            ))}

            <Button
              variant="outline"
              onClick={addVariable}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Variable
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="template" className="space-y-4">
          {validationErrors.payload_template && (
            <p className="text-sm text-red-500 mt-1">{validationErrors.payload_template}</p>
          )}

          <LanguageAwareTextarea
            value={JSON.stringify(formData.payload_template, null, 2)}
            onChange={(e) => {
              try {
                const template = JSON.parse(e.target.value || '{}');
                setFormData(prev => ({ ...prev, payload_template: template }));
              } catch {
                // Invalid JSON, don't update
              }
            }}
            className="font-mono min-h-[200px]"
          />

          <div className="bg-muted p-3 rounded-md text-sm">
            <p className="font-medium mb-2">Available Variables:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{'{phone_number}'}</Badge>
              <Badge variant="secondary">{'{message}'}</Badge>
              <Badge variant="secondary">{'{timestamp}'}</Badge>
              {Object.keys(formData.variable_prompts).map(varName => (
                <Badge key={varName} variant="secondary">
                  {`{{${varName}}}`}
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  // Settings step content
  const renderSettingsStep = () => (
    <div className="space-y-4">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Settings
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure advanced settings and thresholds
        </p>
      </div>
      <div>
        <Label>Confidence Threshold</Label>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.05"
            value={formData.confidence_threshold}
            onChange={(e) => setFormData(prev => ({ ...prev, confidence_threshold: parseFloat(e.target.value) }))}
            className="flex-1"
          />
          <Badge variant="outline">{(formData.confidence_threshold * 100).toFixed(0)}%</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Minimum confidence required to trigger this action
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Retry Attempts</Label>
          <Select
            value={formData.retry_attempts.toString()}
            onValueChange={(value) => setFormData(prev => ({ ...prev, retry_attempts: parseInt(value) }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Timeout (seconds)</Label>
          <Select
            value={formData.timeout_seconds.toString()}
            onValueChange={(value) => setFormData(prev => ({ ...prev, timeout_seconds: parseInt(value) }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="60">60</SelectItem>
              <SelectItem value="120">120</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // Response Configuration step content
  const renderResponseStep = () => (
    <div className="space-y-6">
      {/* Step Title */}
      <div className="border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Response Configuration
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure how ConvGo responds after executing this action
        </p>
      </div>
      
      <div>
        <RadioGroup 
          value={formData.response_type} 
          onValueChange={(value: any) => setFormData(prev => ({ ...prev, response_type: value }))}
          className="mt-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" id="none" />
            <Label htmlFor="none" className="flex-1">
              <div className="font-medium">No Response</div>
              <div className="text-sm text-muted-foreground">Action executes silently without sending any message</div>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="simple_confirmation" id="simple" />
            <Label htmlFor="simple" className="flex-1">
              <div className="font-medium">Simple Confirmation</div>
              <div className="text-sm text-muted-foreground">Send a basic confirmation message immediately</div>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom_message" id="custom" />
            <Label htmlFor="custom" className="flex-1">
              <div className="font-medium">Custom Message with Variables</div>
              <div className="text-sm text-muted-foreground">Send a personalized message using extracted data</div>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="wait_for_webhook" id="webhook" />
            <Label htmlFor="webhook" className="flex-1">
              <div className="font-medium">Wait for Automation Response</div>
              <div className="text-sm text-muted-foreground">Wait for the automation platform to send a dynamic response</div>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {formData.response_type !== 'none' && (
        <div>
          <Label htmlFor="confirmation_message">Confirmation Message</Label>
          <Textarea
            id="confirmation_message"
            value={formData.confirmation_message}
            onChange={(e) => setFormData(prev => ({ ...prev, confirmation_message: e.target.value }))}
            placeholder={
              formData.response_type === 'custom_message' 
                ? "مرحباً {name}، تم استلام طلبك رقم {order_id} بنجاح!" 
                : "✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك."
            }
            rows={3}
            className="mt-2"
          />
          
          {formData.response_type === 'custom_message' && (
            <div className="mt-3 p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-2">Available Variables:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{'phone_number'}</Badge>
                <Badge variant="secondary">{'message'}</Badge>
                <Badge variant="secondary">{'timestamp'}</Badge>
                {Object.keys(formData.variable_prompts).map(varName => (
                  <Badge key={varName} variant="secondary">
                    {varName}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Use {'{variable_name}'} in your message to insert dynamic values
              </p>
            </div>
          )}

          {formData.response_type === 'wait_for_webhook' && (
            <p className="text-sm text-muted-foreground mt-2">
              This message will only be sent if the automation platform fails to respond within the timeout period.
            </p>
          )}
        </div>
      )}

      {formData.response_type === 'wait_for_webhook' && (
        <div>
          <Label>Response Timeout</Label>
          <div className="mt-3">
            <Slider
              value={[formData.response_timeout_seconds || 30]}
              onValueChange={([value]) => setFormData(prev => ({ ...prev, response_timeout_seconds: value }))}
              min={5}
              max={120}
              step={5}
              className="mb-2"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>5 seconds</span>
              <Badge variant="outline">{formData.response_timeout_seconds || 30} seconds</Badge>
              <span>120 seconds</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              How long to wait for a response from the automation platform before timing out
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="response_language">Response Language</Label>
        <Select
          value={formData.response_language}
          onValueChange={(value: any) => setFormData(prev => ({ ...prev, response_language: value }))}
        >
          <SelectTrigger className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ar">Arabic (العربية)</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">French (Français)</SelectItem>
            <SelectItem value="es">Spanish (Español)</SelectItem>
            <SelectItem value="de">German (Deutsch)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground mt-1">
          Primary language for response messages
        </p>
      </div>
    </div>
  );

  // Render current step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderBasicStep();
      case 1:
        return renderTrainingStep();
      case 2:
        return renderWebhookStep();
      case 3:
        return renderPayloadStep();
      case 4:
        return renderSettingsStep();
      case 5:
        return renderResponseStep();
      default:
        return (
          <div className="text-center py-8">
            <p className="text-slate-600 dark:text-slate-400">
              Step {currentStep + 1} content will be implemented here.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-8 w-8 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {mode === 'create' ? 'Create External Action' : 'Edit External Action'}
              </h1>
              <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                {mode === 'create' 
                  ? 'Create a new custom action that triggers webhooks based on customer messages'
                  : `Modify the settings for "${formData.display_name || 'this external action'}"`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-6">
            {/* Progress Indicator */}
            {renderProgressIndicator()}

            {/* Step Content */}
            <div className="min-h-[300px]">
              {renderCurrentStep()}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                {currentStep > 0 && (
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {currentStep < STEPS.length - 1 ? (
                  <Button 
                    onClick={nextStep}
                    className="gap-2"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSave}
                    disabled={loading}
                    className="gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {mode === 'create' ? 'Create Action' : 'Update Action'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExternalActionForm;