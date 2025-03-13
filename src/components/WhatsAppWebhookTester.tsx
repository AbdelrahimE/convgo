
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface WebhookTestResult {
  success: boolean;
  message: string;
  details?: any;
}

const WhatsAppWebhookTester = ({ instanceName }: { instanceName: string }) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);

  const testWebhook = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      
      // First, check if the webhook exists in our database
      const { data: webhookConfig, error: configError } = await supabase
        .from('whatsapp_webhook_config')
        .select('*')
        .eq('instance_name', instanceName)
        .single();
      
      if (configError) {
        if (configError.code === 'PGRST116') {
          setTestResult({
            success: false,
            message: 'No webhook configured for this instance',
            details: 'Please register a webhook before testing'
          });
          return;
        }
        throw configError;
      }
      
      // Now test the webhook by sending a simulated message
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: { 
          action: 'test',
          instanceName,
          testData: {
            event: 'messages.upsert',
            instance: instanceName,
            data: {
              key: {
                remoteJid: '1234567890@s.whatsapp.net',
                fromMe: false,
                id: 'test-message-id-123456'
              },
              messageType: 'conversation',
              message: {
                conversation: 'This is a test message from the webhook tester'
              },
              sender: {
                id: '1234567890',
                name: 'Test User',
                shortName: 'Test'
              },
              chat: {
                id: '1234567890@s.whatsapp.net',
                name: 'Test Chat'
              }
            }
          }
        }
      });
      
      if (error) throw error;
      
      setTestResult({
        success: data.success,
        message: data.message || 'Test completed',
        details: data.details || {}
      });
      
      if (data.success) {
        toast.success('Webhook test successful!', {
          description: 'The webhook endpoint processed the test message correctly.'
        });
      } else {
        toast.error('Webhook test failed', {
          description: data.message || 'Unknown error'
        });
      }
      
    } catch (error) {
      console.error('Error testing webhook:', error);
      setTestResult({
        success: false,
        message: 'Error testing webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to test webhook', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Webhook Testing Tool</CardTitle>
        <CardDescription>
          Verify that your webhook endpoint is working correctly by sending a test message
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Alert className="bg-blue-50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>About EVOLUTION API Webhook Configuration</AlertTitle>
            <AlertDescription>
              When configuring webhooks in EVOLUTION API, you only need to:
              <ol className="list-decimal ml-6 mt-2 space-y-1">
                <li>Enter the webhook URL from the Endpoints tab</li>
                <li>Select which events you want to receive (messages.upsert, connection.update, etc.)</li>
                <li>Save the configuration</li>
              </ol>
              <p className="mt-2">
                <strong>Important:</strong> EVOLUTION API handles all the headers and authentication automatically - you don't
                need to configure Content-Type or Authorization headers. Our webhook endpoint is designed to accept
                requests directly from EVOLUTION API without additional authentication.
              </p>
            </AlertDescription>
          </Alert>
          
          <p className="text-sm text-muted-foreground">
            This will send a simulated message to your webhook endpoint to verify that it can correctly
            receive and process WhatsApp messages.
          </p>
          
          {testResult && (
            <div className={`mt-4 p-3 rounded-md ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {testResult.message}
                  </p>
                  {testResult.details && (
                    <pre className="mt-2 text-xs overflow-auto max-h-40 p-2 bg-black/5 rounded">
                      {typeof testResult.details === 'string' 
                        ? testResult.details 
                        : JSON.stringify(testResult.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Button 
          variant="outline"
          onClick={() => window.open("https://doc.evolution-api.com/v2/api-reference/set-webhook", "_blank")}
          size="sm"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Webhook Docs
        </Button>
        
        <Button 
          onClick={testWebhook} 
          disabled={isTesting || !instanceName}
        >
          {isTesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing Webhook...
            </>
          ) : (
            'Test Webhook'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WhatsAppWebhookTester;
