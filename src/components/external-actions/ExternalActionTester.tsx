import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Code,
  MessageSquare,
  TrendingUp,
  Clock,
  Zap,
  Reply,
  Timer,
  Webhook
} from 'lucide-react';
import logger from '@/utils/logger';

interface ExternalAction {
  id: string;
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
  whatsapp_instance_id: string;
  // 🚀 External Actions V2 fields
  response_type?: 'none' | 'simple_confirmation' | 'custom_message' | 'wait_for_webhook';
  confirmation_message?: string;
  response_timeout_seconds?: number;
  response_language?: 'ar' | 'en' | 'fr' | 'es' | 'de';
}

interface ExternalActionTesterProps {
  open: boolean;
  onClose: () => void;
  action: ExternalAction | null;
}

interface TestResult {
  detectionResult: {
    matched: boolean;
    confidence: number;
    extractedVariables: Record<string, any>;
    reasoning: string;
  } | null;
  payloadPreview: Record<string, any> | null;
  executionResult: {
    success: boolean;
    httpStatusCode?: number;
    responseData?: any;
    errorMessage?: string;
    executionTime: number;
    retryCount: number;
  } | null;
}

const ExternalActionTester: React.FC<ExternalActionTesterProps> = ({
  open,
  onClose,
  action
}) => {
  const { session } = useAuth();
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult>({
    detectionResult: null,
    payloadPreview: null,
    executionResult: null
  });

  const resetResults = () => {
    setResults({
      detectionResult: null,
      payloadPreview: null,
      executionResult: null
    });
  };

  const testDetection = async () => {
    if (!action || !testMessage.trim()) return;

    setTesting(true);
    resetResults();

    try {
      // Test intent detection using smart-intent-analyzer
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Use session token for better authentication, fallback to anon key
      const authToken = session?.access_token || supabaseAnonKey;
      
      logger.info('🧪 Testing external action detection:', {
        actionId: action.id,
        actionName: action.action_name,
        instanceId: action.whatsapp_instance_id,
        messageLength: testMessage.length,
        hasSession: !!session,
        authMethod: session?.access_token ? 'session_token' : 'anon_key'
      });
      
      const response = await fetch(`${supabaseUrl}/functions/v1/smart-intent-analyzer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message: testMessage,
          whatsappInstanceId: action.whatsapp_instance_id,
          conversationHistory: []
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ Detection test API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url: `${supabaseUrl}/functions/v1/smart-intent-analyzer`,
          actionId: action.id,
          instanceId: action.whatsapp_instance_id
        });
        throw new Error(`Detection test failed: ${response.status} - ${errorText}`);
      }

      const intentResult = await response.json();
      
      // 🐛 DEBUGGING: Log the complete API response
      logger.info('🔍 DEBUGGING: Complete API Response:', {
        fullResponse: intentResult,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        hasExternalAction: !!intentResult.externalAction,
        externalActionId: intentResult.externalAction?.id,
        frontendActionId: action.id,
        actionName: action.action_name,
        responseKeys: Object.keys(intentResult)
      });
      
      // Check if our action was detected
      const isExternalAction = intentResult.intent === 'external_action';
      const matchedOurAction = isExternalAction && 
        intentResult.externalAction?.id === action.id;
      
      // 🐛 DEBUGGING: Log the comparison results
      logger.info('🔍 DEBUGGING: Detection Logic:', {
        isExternalAction,
        hasExternalActionObject: !!intentResult.externalAction,
        idsMatch: intentResult.externalAction?.id === action.id,
        backendId: intentResult.externalAction?.id,
        frontendId: action.id,
        finalResult: matchedOurAction
      });

      setResults(prev => ({
        ...prev,
        detectionResult: {
          matched: matchedOurAction,
          confidence: intentResult.confidence || 0,
          extractedVariables: intentResult.externalAction?.extractedVariables || {},
          reasoning: intentResult.reasoning || 'No reasoning provided'
        }
      }));

      // If detected, generate payload preview
      if (matchedOurAction) {
        const extractedVars = intentResult.externalAction.extractedVariables || {};
        const payload = interpolateTemplate(action.payload_template, {
          phone_number: '+1234567890', // Mock phone
          message: testMessage,
          timestamp: new Date().toISOString(),
          ...extractedVars
        });

        setResults(prev => ({
          ...prev,
          payloadPreview: payload
        }));
      }

      logger.info('✅ Detection test completed successfully:', {
        isExternalAction,
        matchedOurAction,
        confidence: intentResult.confidence,
        extractedVariables: intentResult.externalAction?.extractedVariables
      });
      
      toast.success('Detection test completed');
    } catch (error) {
      logger.error('❌ Error testing detection:', {
        error: error instanceof Error ? error.message : error,
        actionId: action?.id,
        instanceId: action?.whatsapp_instance_id,
        messageLength: testMessage.length,
        hasSession: !!session
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to test action detection: ${errorMessage}`);
    } finally {
      setTesting(false);
    }
  };

  const executeTest = async () => {
    if (!results.detectionResult?.matched || !results.payloadPreview) {
      toast.error('Please run detection test first');
      return;
    }

    setTesting(true);

    try {
      // Execute the webhook using external-action-executor
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Use session token for better authentication, fallback to anon key
      const authToken = session?.access_token || supabaseAnonKey;
      
      logger.info('🚀 Executing external action webhook test:', {
        actionId: action!.id,
        actionName: action!.action_name,
        hasSession: !!session,
        authMethod: session?.access_token ? 'session_token' : 'anon_key',
        extractedVariables: results.detectionResult.extractedVariables
      });
      
      const response = await fetch(`${supabaseUrl}/functions/v1/external-action-executor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          externalActionId: action!.id,
          extractedVariables: results.detectionResult.extractedVariables,
          intentConfidence: results.detectionResult.confidence
        })
      });

      const executionData = await response.json();

      // 🐛 DEBUGGING: Log execution response for analysis
      logger.info('🔍 DEBUGGING: Webhook execution response:', {
        executionSuccess: executionData.success,
        httpStatusCode: executionData.httpStatusCode,
        hasResponseData: !!executionData.responseData,
        errorMessage: executionData.errorMessage,
        executionTime: executionData.executionTimeMs,
        retryCount: executionData.retryCount,
        fullResponse: executionData
      });

      setResults(prev => ({
        ...prev,
        executionResult: {
          success: executionData.success,
          httpStatusCode: executionData.httpStatusCode,
          responseData: executionData.responseData,
          errorMessage: executionData.errorMessage,
          executionTime: executionData.executionTimeMs || 0,
          retryCount: executionData.retryCount || 0
        }
      }));

      if (executionData.success) {
        // Enhanced success message with status code
        const statusMessage = executionData.httpStatusCode === 202 
          ? 'Webhook accepted successfully (Status 202 - Processing)'
          : `Webhook executed successfully (Status ${executionData.httpStatusCode})`;
        toast.success(statusMessage);
        logger.info('✅ Webhook execution completed successfully:', {
          statusCode: executionData.httpStatusCode,
          executionTime: executionData.executionTimeMs
        });
      } else {
        // Enhanced error message with more details
        const errorMsg = executionData.errorMessage 
          ? `Webhook execution failed: ${executionData.errorMessage}` 
          : 'Webhook execution failed';
        toast.error(errorMsg);
        logger.error('❌ Webhook execution failed:', {
          statusCode: executionData.httpStatusCode,
          errorMessage: executionData.errorMessage,
          executionTime: executionData.executionTimeMs
        });
      }
    } catch (error) {
      logger.error('Error executing webhook:', error);
      toast.error('Failed to execute webhook');
      
      setResults(prev => ({
        ...prev,
        executionResult: {
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          executionTime: 0,
          retryCount: 0
        }
      }));
    } finally {
      setTesting(false);
    }
  };

  const interpolateTemplate = (template: Record<string, any>, variables: Record<string, any>): Record<string, any> => {
    const result = JSON.parse(JSON.stringify(template));
    
    const replaceInObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
          return variables[varName] !== undefined ? variables[varName] : match;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(replaceInObject);
      } else if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
          newObj[key] = replaceInObject(value);
        }
        return newObj;
      }
      return obj;
    };
    
    return replaceInObject(result);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  // 🚀 External Actions V2: Get response type badge and description
  const getResponseTypeBadge = (responseType?: string) => {
    switch (responseType) {
      case 'none':
        return (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            <div>
              <div className="font-medium">No Response</div>
              <div className="text-xs text-muted-foreground">Action executes silently</div>
            </div>
          </div>
        );
      case 'simple_confirmation':
        return (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <div>
              <div className="font-medium">Simple Confirmation</div>
              <div className="text-xs text-muted-foreground">Sends basic confirmation immediately</div>
            </div>
          </div>
        );
      case 'custom_message':
        return (
          <div className="flex items-center gap-2">
            <Reply className="w-4 h-4 text-blue-500" />
            <div>
              <div className="font-medium">Custom Message</div>
              <div className="text-xs text-muted-foreground">Personalized message with variables</div>
            </div>
          </div>
        );
      case 'wait_for_webhook':
        return (
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-purple-500" />
            <div>
              <div className="font-medium">Wait for Webhook Response</div>
              <div className="text-xs text-muted-foreground">Dynamic response from automation platform</div>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <div>
              <div className="font-medium">Simple Confirmation (Default)</div>
              <div className="text-xs text-muted-foreground">Legacy action - uses default response</div>
            </div>
          </div>
        );
    }
  };

  // Process template for custom messages
  const processTemplate = (template: string, variables: Record<string, any>): string => {
    let processed = template;
    
    // Replace {variable_name} with actual values
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      processed = processed.replace(regex, variables[key] || '');
    });
    
    // Clean up any remaining unmatched variables
    processed = processed.replace(/\{[^}]+\}/g, '');
    
    return processed;
  };

  if (!action) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Test Action: {action.display_name}</DialogTitle>
          <DialogDescription>
            Test how this action detects messages and executes webhooks
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Test Input */}
          <div className="space-y-3">
            <Label>Test Message</Label>
            <LanguageAwareTextarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="I want to buy 3 iPhones"
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button 
                onClick={testDetection}
                disabled={testing || !testMessage.trim()}
                className="gap-2"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Test Detection
              </Button>
              
              <Button 
                onClick={executeTest}
                disabled={testing || !results.detectionResult?.matched}
                variant="outline"
                className="gap-2"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Execute Webhook
              </Button>
            </div>
          </div>

          {/* Results */}
          <Tabs defaultValue="detection" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="detection">Detection Result</TabsTrigger>
              <TabsTrigger value="payload">Payload Preview</TabsTrigger>
              <TabsTrigger value="response">Response Preview</TabsTrigger>
              <TabsTrigger value="execution">Execution Result</TabsTrigger>
            </TabsList>

            {/* Detection Results */}
            <TabsContent value="detection">
              {results.detectionResult ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        {results.detectionResult.matched ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Action Detected
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            Action Not Detected
                          </>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={getConfidenceColor(results.detectionResult.confidence)}
                        >
                          {(results.detectionResult.confidence * 100).toFixed(1)}% Confidence
                        </Badge>
                        <Badge variant="secondary">
                          {getConfidenceLabel(results.detectionResult.confidence)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>AI Reasoning</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {results.detectionResult.reasoning}
                      </p>
                    </div>

                    {Object.keys(results.detectionResult.extractedVariables).length > 0 && (
                      <div>
                        <Label>Extracted Variables</Label>
                        <div className="bg-muted p-3 rounded-md mt-1">
                          <pre className="text-sm">
                            {JSON.stringify(results.detectionResult.extractedVariables, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className="text-sm text-muted-foreground">
                      <p>Confidence threshold for this action: {(action.confidence_threshold * 100).toFixed(0)}%</p>
                      <p>
                        Status: {results.detectionResult.confidence >= action.confidence_threshold ? (
                          <span className="text-green-600 font-medium">Above threshold - would trigger</span>
                        ) : (
                          <span className="text-red-600 font-medium">Below threshold - would not trigger</span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Enter a test message and click "Test Detection" to see results</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Payload Preview */}
            <TabsContent value="payload">
              {results.payloadPreview ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Webhook Payload</CardTitle>
                    <CardDescription>
                      This is the JSON data that would be sent to your webhook
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded-md">
                      <pre className="text-sm overflow-x-auto">
                        {JSON.stringify(results.payloadPreview, null, 2)}
                      </pre>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Code className="w-4 h-4" />
                      Method: {action.http_method}
                      <span>•</span>
                      URL: {action.webhook_url}
                    </div>
                    
                    {/* 🚀 V2: Show response URL for wait_for_webhook */}
                    {action.response_type === 'wait_for_webhook' && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Webhook className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            Response URL Included
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          The payload includes `_response_url` and `_execution_id` fields for dynamic responses.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Payload preview will appear after successful detection test</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* 🚀 V2: Response Preview Tab */}
            <TabsContent value="response">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Reply className="w-5 h-5 text-blue-500" />
                    Response Configuration (V2)
                  </CardTitle>
                  <CardDescription>
                    How ConvGo will respond to the user after executing this action
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Response Type */}
                  <div>
                    <Label className="text-base">Response Type</Label>
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      {getResponseTypeBadge(action.response_type)}
                    </div>
                  </div>

                  {/* Response Message Preview */}
                  {action.response_type !== 'none' && (
                    <div>
                      <Label className="text-base">Message Preview</Label>
                      <div className="mt-2 p-3 border rounded-md">
                        {action.response_type === 'custom_message' && results.detectionResult ? (
                          <div>
                            <div className="text-sm font-medium mb-2">Personalized Message:</div>
                            <div className="bg-green-50 border border-green-200 p-3 rounded text-sm">
                              {processTemplate(
                                action.confirmation_message || '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.',
                                results.detectionResult.extractedVariables
                              )}
                            </div>
                          </div>
                        ) : action.response_type === 'wait_for_webhook' ? (
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm font-medium mb-2">Initial Response:</div>
                              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                  <Timer className="w-4 h-4 text-yellow-600" />
                                  <span className="text-yellow-800 font-medium">No immediate response</span>
                                </div>
                                <p className="text-yellow-700">Waiting for automation platform to respond...</p>
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-sm font-medium mb-2">Timeout Fallback ({action.response_timeout_seconds || 30}s):</div>
                              <div className="bg-gray-50 border border-gray-200 p-3 rounded text-sm text-gray-700">
                                {action.confirmation_message || 'عذراً، انتهت مهلة الاستجابة. يرجى المحاولة مرة أخرى.'}
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-sm font-medium mb-2">Dynamic Response Example:</div>
                              <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle className="w-4 h-4 text-blue-600" />
                                  <span className="text-blue-800 font-medium">From Automation Platform</span>
                                </div>
                                <p className="text-blue-700">\"Your booking #12345 has been confirmed for tomorrow at 2 PM!\"</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-green-50 border border-green-200 p-3 rounded text-sm text-green-700">
                            {action.confirmation_message || '✅ تم استلام البيانات وإرسالها بنجاح!\nشكراً لك.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Configuration Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    {action.response_language && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Language</Label>
                        <div className="font-medium">
                          {action.response_language === 'ar' && 'Arabic (العربية)'}
                          {action.response_language === 'en' && 'English'}
                          {action.response_language === 'fr' && 'French (Français)'}
                          {action.response_language === 'es' && 'Spanish (Español)'}
                          {action.response_language === 'de' && 'German (Deutsch)'}
                        </div>
                      </div>
                    )}
                    
                    {action.response_type === 'wait_for_webhook' && action.response_timeout_seconds && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Response Timeout</Label>
                        <div className="font-medium">{action.response_timeout_seconds} seconds</div>
                      </div>
                    )}
                  </div>

                  {/* Testing Note */}
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md">
                    <div className="flex gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Testing Note
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Response behavior is simulated in this test environment. 
                          Actual responses will be sent via WhatsApp when the action is triggered in production.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Execution Results */}
            <TabsContent value="execution">
              {results.executionResult ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        {results.executionResult.success ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Webhook Executed Successfully
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            Webhook Execution Failed
                          </>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {results.executionResult.httpStatusCode && (
                          <Badge 
                            variant={results.executionResult.success ? "default" : "destructive"}
                          >
                            HTTP {results.executionResult.httpStatusCode}
                          </Badge>
                        )}
                        <Badge variant="outline" className="gap-1">
                          <Clock className="w-3 h-3" />
                          {results.executionResult.executionTime}ms
                        </Badge>
                        {results.executionResult.retryCount > 0 && (
                          <Badge variant="secondary">
                            {results.executionResult.retryCount} retries
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {results.executionResult.errorMessage && (
                      <div>
                        <Label>Error Message</Label>
                        <p className="text-sm text-red-600 mt-1">
                          {results.executionResult.errorMessage}
                        </p>
                      </div>
                    )}

                    {results.executionResult.responseData && (
                      <div>
                        <Label>Response Data</Label>
                        <div className="mt-1">
                          {(() => {
                            const response = results.executionResult.responseData;
                            
                            // Handle plain text success responses
                            if (response.type === 'plain_text_success' && response.message) {
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-sm font-medium text-green-600">Success Response</span>
                                  </div>
                                  <div className="bg-green-50 border border-green-200 p-3 rounded-md">
                                    <p className="text-sm text-green-800 font-mono">
                                      {response.message}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Handle JSON parse errors with raw response
                            if (response.type === 'json_parse_error' && response.rawResponse) {
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-medium text-amber-600">Plain Text Response</span>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                                    <p className="text-sm text-amber-800 font-mono mb-2">
                                      {response.rawResponse}
                                    </p>
                                    <p className="text-xs text-amber-600">
                                      Note: This response is not JSON format
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Handle regular JSON responses
                            return (
                              <div className="bg-muted p-3 rounded-md">
                                <pre className="text-sm overflow-x-auto">
                                  {JSON.stringify(response, null, 2)}
                                </pre>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Execution results will appear after running the webhook test</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Training Examples Reference */}
          <Card>
            <CardHeader>
              <CardTitle>Training Examples Reference</CardTitle>
              <CardDescription>
                These are the examples this action was trained on
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {action.training_examples.map((example, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 bg-muted rounded-md">
                    <Badge variant="outline" className="text-xs">
                      {example.language.toUpperCase()}
                    </Badge>
                    <span className="text-sm">{example.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalActionTester;