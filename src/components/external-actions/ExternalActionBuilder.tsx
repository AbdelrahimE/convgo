import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Reply
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import logger from '@/utils/logger';

// UUID-based variable structure for internal state management
interface Variable {
  id: string;        // Stable UUID - never changes
  name: string;      // Variable name - editable
  prompt: string;    // Prompt text - editable
}

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
  // 🚀 External Actions V2 fields
  response_type?: 'none' | 'simple_confirmation' | 'custom_message' | 'wait_for_webhook';
  confirmation_message?: string;
  wait_for_response?: boolean;
  response_timeout_seconds?: number;
  response_language?: 'ar' | 'en' | 'fr' | 'es' | 'de';
}

interface ExternalActionBuilderProps {
  open: boolean;
  onClose: () => void;
  whatsappInstanceId: string;
  existingAction?: ExternalAction | null;
  onSuccess: () => void;
}

const STEPS = [
  { id: 'basic', title: 'Basic Info', icon: MessageSquare },
  { id: 'training', title: 'Training Examples', icon: Globe },
  { id: 'webhook', title: 'Webhook Config', icon: Zap },
  { id: 'payload', title: 'Payload & Variables', icon: Code },
  { id: 'settings', title: 'Settings', icon: Settings },
  { id: 'response', title: 'Response Configuration', icon: Reply }
];

const ExternalActionBuilder: React.FC<ExternalActionBuilderProps> = ({
  open,
  onClose,
  whatsappInstanceId,
  existingAction,
  onSuccess
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Internal variables state with UUID keys (solves focus issue)
  const [variables, setVariables] = useState<Variable[]>([]);

  // Form state
  const [formData, setFormData] = useState<ExternalAction>({
    action_name: '',
    display_name: '',
    training_examples: [],
    webhook_url: '',
    http_method: 'POST',
    headers: {},
    payload_template: {},
    variable_prompts: {},
    confidence_threshold: 0.75,
    is_active: true,
    retry_attempts: 3,
    timeout_seconds: 30,
    // 🚀 External Actions V2 defaults
    response_type: 'simple_confirmation',
    confirmation_message: '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
    wait_for_response: false,
    response_timeout_seconds: 30,
    response_language: 'ar'
  });

  // Conversion functions for compatibility with database format
  const convertVariablesToLegacyFormat = (variables: Variable[]) => {
    const variable_prompts: Record<string, string> = {};
    const payload_template: Record<string, any> = {
      phone_number: '{{phone_number}}',
      message: '{{message}}',
      timestamp: '{{timestamp}}'
    };

    variables.forEach(variable => {
      variable_prompts[variable.name] = variable.prompt;
      payload_template[variable.name] = `{{${variable.name}}}`;
    });

    return { variable_prompts, payload_template };
  };

  const convertLegacyFormatToVariables = (variable_prompts: Record<string, string>): Variable[] => {
    return Object.entries(variable_prompts || {}).map(([name, prompt]) => ({
      id: crypto.randomUUID(),
      name,
      prompt
    }));
  };

  // Initialize form with existing action data
  useEffect(() => {
    if (open) {
      if (existingAction) {
        // Convert existing data to new format
        const existingVariables = convertLegacyFormatToVariables(existingAction.variable_prompts);
        setVariables(existingVariables);

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
          // 🚀 External Actions V2 fields with fallbacks
          response_type: existingAction.response_type || 'simple_confirmation',
          confirmation_message: existingAction.confirmation_message || '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
          wait_for_response: existingAction.wait_for_response || false,
          response_timeout_seconds: existingAction.response_timeout_seconds || 30,
          response_language: existingAction.response_language || 'ar'
        });
      } else {
        // Reset for new action
        setVariables([]);
        setFormData({
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
          // 🚀 External Actions V2 defaults
          response_type: 'simple_confirmation',
          confirmation_message: '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
          wait_for_response: false,
          response_timeout_seconds: 30,
          response_language: 'ar'
        });
      }
      setCurrentStep(0);
      setValidationErrors({});
    }
  }, [open, existingAction]);

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
    const newVariable: Variable = {
      id: crypto.randomUUID(),
      name: `variable_${variables.length + 1}`,
      prompt: ''
    };
    setVariables(prev => [...prev, newVariable]);
  };

  const updateVariable = (id: string, field: 'name' | 'prompt', value: string) => {
    setVariables(prev => prev.map(variable =>
      variable.id === id
        ? { ...variable, [field]: value }
        : variable
    ));
  };

  const removeVariable = (id: string) => {
    setVariables(prev => prev.filter(variable => variable.id !== id));
  };

  const handleSave = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setLoading(true);
    try {
      // Convert variables to legacy format for database compatibility
      const { variable_prompts, payload_template } = convertVariablesToLegacyFormat(variables);

      const actionData = {
        ...formData,
        variable_prompts,
        payload_template,
        user_id: user?.id,
        whatsapp_instance_id: whatsappInstanceId,
        updated_at: new Date().toISOString()
      };

      if (existingAction?.id) {
        // Update existing action
        const { error } = await supabase
          .from('external_actions')
          .update(actionData)
          .eq('id', existingAction.id);

        if (error) throw error;
        toast.success('External action updated successfully');
      } else {
        // Create new action
        const { error } = await supabase
          .from('external_actions')
          .insert([actionData]);

        if (error) throw error;
        toast.success('External action created successfully');
      }

      onSuccess();
    } catch (error) {
      logger.error('Error saving external action:', error);
      toast.error('Failed to save external action');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Basic Info
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="Create Shopify Order"
                className={validationErrors.display_name ? 'border-red-500' : ''}
              />
              {validationErrors.display_name && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.display_name}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Human-readable name shown in the interface
              </p>
            </div>

            <div>
              <Label htmlFor="action_name">Action Name *</Label>
              <Input
                id="action_name"
                value={formData.action_name}
                onChange={(e) => setFormData(prev => ({ ...prev, action_name: e.target.value }))}
                placeholder="create_shopify_order"
                className={validationErrors.action_name ? 'border-red-500' : ''}
              />
              {validationErrors.action_name && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.action_name}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Internal identifier (lowercase letters, numbers, and underscores only)
              </p>
            </div>
          </div>
        );

      case 1: // Training Examples
        return (
          <div className="space-y-4">
            <div>
              <Label>Training Examples *</Label>
              <p className="text-sm text-muted-foreground">
                Provide examples of messages that should trigger this action. The AI will learn from these patterns.
              </p>
              {validationErrors.training_examples && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.training_examples}</p>
              )}
            </div>

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

      case 2: // Webhook Config
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="webhook_url">Webhook URL *</Label>
              <Input
                id="webhook_url"
                value={formData.webhook_url}
                onChange={(e) => setFormData(prev => ({ ...prev, webhook_url: e.target.value }))}
                placeholder="https://hooks.convgo.com/hooks/catch/123456/abcdef/"
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

      case 3: // Payload & Variables
        return (
          <div className="space-y-4">
            <Tabs defaultValue="variables" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="variables">Variables</TabsTrigger>
                <TabsTrigger value="template">Payload Template</TabsTrigger>
              </TabsList>

              <TabsContent value="variables" className="space-y-4">
                <div>
                  <Label>Variables to Extract</Label>
                  <p className="text-sm text-muted-foreground">
                    Define what data to extract from customer messages and how to extract it.
                  </p>
                </div>

                <div className="space-y-3">
                  {variables.map((variable) => (
                    <Card key={variable.id} className="p-3">
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <Input
                            value={variable.name}
                            onChange={(e) => updateVariable(variable.id, 'name', e.target.value)}
                            placeholder="product_name"
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeVariable(variable.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <LanguageAwareTextarea
                          value={variable.prompt}
                          onChange={(e) => updateVariable(variable.id, 'prompt', e.target.value)}
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
                <div>
                  <Label>Payload Template (JSON)</Label>
                  <p className="text-sm text-muted-foreground">
                    Define the JSON structure that will be sent to your webhook. Use {"{{variable_name}}"} for dynamic values.
                  </p>
                  {validationErrors.payload_template && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.payload_template}</p>
                  )}
                </div>

                <LanguageAwareTextarea
                  value={JSON.stringify(convertVariablesToLegacyFormat(variables).payload_template, null, 2)}
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
                    <Badge variant="secondary">{'{{phone_number}}'}</Badge>
                    <Badge variant="secondary">{'{{message}}'}</Badge>
                    <Badge variant="secondary">{'{{timestamp}}'}</Badge>
                    {variables.map(variable => (
                      <Badge key={variable.id} variant="secondary">
                        {`{{${variable.name}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        );

      case 4: // Settings
        return (
          <div className="space-y-4">
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

      case 5: // 🚀 External Actions V2: Response Configuration
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Response Type</Label>
              <p className="text-sm text-muted-foreground">
                Choose how ConvGo should respond after executing this action
              </p>
              
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
                      ? "Hello {name}, your order {order_id} has been received successfully!" 
                      : "✅ Data received and sent successfully!\nThank you."
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
                      {variables.map(variable => (
                        <Badge key={variable.id} variant="secondary">
                          {variable.name}
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

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    External Actions V2 Features
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-1">
                    <li>• <strong>Wait for Webhook:</strong> Automation platforms can send dynamic responses</li>
                    <li>• <strong>Custom Messages:</strong> Personalize responses with extracted variables</li>
                    <li>• <strong>Flexible Timeouts:</strong> Configure response wait times</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {existingAction ? 'Edit External Action' : 'Create External Action'}
          </DialogTitle>
          <DialogDescription>
            {STEPS[currentStep].title}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between border-b pb-4">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full border-2 
                  ${isActive ? 'border-primary bg-primary text-primary-foreground' : ''}
                  ${isCompleted ? 'border-green-500 bg-green-500 text-white' : ''}
                  ${!isActive && !isCompleted ? 'border-muted-foreground' : ''}
                `}>
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`h-0.5 w-8 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            
            {currentStep === STEPS.length - 1 ? (
              <Button
                onClick={handleSave}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {existingAction ? 'Update Action' : 'Create Action'}
              </Button>
            ) : (
              <Button onClick={nextStep} className="gap-2">
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalActionBuilder;