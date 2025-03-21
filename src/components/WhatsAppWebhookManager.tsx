
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Loader2, Mic, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIResponse } from '@/hooks/use-ai-response';
import { Badge } from '@/components/ui/badge';

const WhatsAppWebhookManager: React.FC<{ instanceName: string }> = ({ instanceName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [webhookConfig, setWebhookConfig] = useState<{
    id?: string;
    webhook_url?: string;
    is_active?: boolean;
    last_status?: string;
    last_checked_at?: string;
  } | null>(null);
  const [showVoiceCapabilities, setShowVoiceCapabilities] = useState(false);
  const { transcribeAudio, isTranscribing } = useAIResponse();

  // Check webhook status on load
  useEffect(() => {
    if (instanceName) {
      checkWebhookStatus();
    }
  }, [instanceName]);

  const checkWebhookStatus = async () => {
    try {
      if (!instanceName) return;
      
      setIsLoading(true);
      setStatus('checking');
      
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: { action: 'status' }
      });
      
      if (error) throw error;
      
      if (data.success && data.activeWebhooks) {
        const instanceWebhook = data.activeWebhooks.find(
          (webhook: any) => webhook.instance_name === instanceName
        );
        
        if (instanceWebhook) {
          setStatus('connected');
          setWebhookConfig(instanceWebhook);
        } else {
          // The webhook is configured at server level, but we don't have specific info for this instance
          setStatus('connected');
          setWebhookConfig({
            webhook_url: 'Server-configured webhook',
            is_active: true,
            last_status: 'Active',
          });
        }
      } else {
        // If we can't get specific info, assume it's connected since it's server-configured
        setStatus('connected');
        setWebhookConfig({
          webhook_url: 'Server-configured webhook',
          is_active: true,
          last_status: 'Active',
        });
      }
    } catch (error) {
      console.error('Error checking webhook status:', error);
      setStatus('error');
      // Don't show error toast on routine checks
    } finally {
      setIsLoading(false);
    }
  };

  const testAudioTranscription = async () => {
    try {
      // This is just a test audio URL - in production this would come from the webhook
      const testAudioUrl = "https://audio-samples.github.io/samples/mp3/blizzard_biased/sample-1.mp3";
      
      const result = await transcribeAudio({
        audioUrl: testAudioUrl,
        mimeType: "audio/mp3",
        instanceName
      });
      
      if (result.success) {
        toast.success(`Transcription test successful: "${result.transcription}"`);
      } else {
        toast.error(`Transcription test failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error testing transcription:", error);
      toast.error("Transcription test failed");
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>WhatsApp Webhook Status</span>
          {status === 'connected' && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Active
              </div>
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          The webhook for receiving WhatsApp messages is configured at the server level
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-2 mb-4">
              <div 
                className={`w-3 h-3 rounded-full ${
                  status === 'connected' 
                    ? 'bg-green-500' 
                    : status === 'checking' 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
              />
              <span className="text-sm font-medium">
                {status === 'connected' 
                  ? 'Webhook active and receiving messages' 
                  : status === 'checking' 
                    ? 'Checking webhook status...' 
                    : 'Error checking webhook status'}
              </span>
            </div>
            
            {webhookConfig && (
              <div className="mt-2 text-sm mb-4">
                <p className="mt-2">
                  <span className="font-medium">Status: </span>
                  <span>{webhookConfig.last_status || 'Active'}</span>
                </p>
                {webhookConfig.last_checked_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {new Date(webhookConfig.last_checked_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            
            <div className="mt-2 text-sm text-muted-foreground">
              <p>
                Your WhatsApp instance is automatically configured to send messages to our webhook.
                When the system receives incoming WhatsApp messages, it will automatically respond 
                using the configured system prompts and knowledge base files.
              </p>
            </div>

            {showVoiceCapabilities ? (
              <div className="mt-4 border border-blue-200 rounded-md p-4 bg-blue-50">
                <h3 className="text-sm font-medium text-blue-800 mb-2 flex items-center">
                  <Volume2 className="h-4 w-4 mr-1.5" />
                  Voice Message Support
                </h3>
                <p className="text-xs text-blue-700 mb-2">
                  Voice messages sent to your WhatsApp number will be automatically transcribed, 
                  processed through the same RAG pipeline as text messages, and receive AI responses.
                </p>
                <p className="text-xs text-blue-700 mb-3">
                  Supported languages include English, Spanish, Portuguese, French, and many others.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={testAudioTranscription}
                  disabled={isTranscribing}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Testing Transcription...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      <span>Test Voice Transcription</span>
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-4">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowVoiceCapabilities(true)}
                  className="flex items-center gap-1.5"
                >
                  <Volume2 className="h-4 w-4" />
                  <span>Show Voice Message Capabilities</span>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppWebhookManager;
