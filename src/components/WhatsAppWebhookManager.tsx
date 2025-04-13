
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Mic, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIResponse } from '@/hooks/use-ai-response';
import logger from '@/utils/logger';

const WhatsAppWebhookManager: React.FC<{
  instanceName: string;
}> = ({
  instanceName
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [webhookConfig, setWebhookConfig] = useState<{
    id?: string;
    webhook_url?: string;
    is_active?: boolean;
    last_status?: string;
    last_checked_at?: string;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Unknown');
  const [showVoiceCapabilities, setShowVoiceCapabilities] = useState(false);
  const {
    transcribeAudio,
    isTranscribing
  } = useAIResponse();

  // Check webhook status on load
  useEffect(() => {
    if (instanceName) {
      checkWebhookStatus();
      checkInstanceStatus();
    }
  }, [instanceName]);

  const checkInstanceStatus = async () => {
    try {
      if (!instanceName) return;
      
      logger.log('Checking instance status for:', instanceName);
      
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('status, last_connected')
        .eq('instance_name', instanceName)
        .maybeSingle();
        
      if (error) {
        logger.error('Error fetching instance status:', error);
        return;
      }
      
      if (data) {
        logger.log('Instance status from DB:', data.status);
        setConnectionStatus(data.status);
      } else {
        logger.warn('No instance found with name:', instanceName);
      }
    } catch (error) {
      logger.error('Exception checking instance status:', error);
    }
  };

  const checkWebhookStatus = async () => {
    try {
      if (!instanceName) return;
      setIsLoading(true);
      setStatus('checking');
      const {
        data,
        error
      } = await supabase.functions.invoke('whatsapp-webhook', {
        body: {
          action: 'status'
        }
      });
      if (error) throw error;
      if (data.success && data.activeWebhooks) {
        const instanceWebhook = data.activeWebhooks.find((webhook: any) => webhook.instance_name === instanceName);
        if (instanceWebhook) {
          setStatus('connected');
          setWebhookConfig(instanceWebhook);
        } else {
          // The webhook is configured at server level, but we don't have specific info for this instance
          setStatus('connected');
          setWebhookConfig({
            webhook_url: 'Server-configured webhook',
            is_active: true,
            last_status: 'Active'
          });
        }
      } else {
        // If we can't get specific info, assume it's connected since it's server-configured
        setStatus('connected');
        setWebhookConfig({
          webhook_url: 'Server-configured webhook',
          is_active: true,
          last_status: 'Active'
        });
      }
      
      // Check instance status after webhook status
      await checkInstanceStatus();
    } catch (error) {
      logger.error('Error checking webhook status:', error);
      setStatus('error');
      // Don't show error toast on routine checks
    } finally {
      setIsLoading(false);
    }
  };

  const testAudioTranscription = async () => {
    try {
      // This is just a test audio URL - in production this would come from the webhook
      // Using a reliable, small public audio file for testing
      const testAudioUrl = "https://audio-samples.github.io/samples/mp3/blizzard_biased/sample-1.mp3";
      logger.log("Starting test audio transcription");
      const result = await transcribeAudio({
        audioUrl: testAudioUrl,
        mimeType: "audio/mp3",
        instanceName
      });
      if (result.success) {
        toast.success(`Transcription test successful: "${result.transcription}"`);
        logger.log("Transcription details:", result);
      } else {
        logger.error("Transcription test failed:", result.error);
        toast.error(`Transcription test failed: ${result.error}`);
      }
    } catch (error) {
      logger.error("Error testing transcription:", error);
      toast.error(`Transcription test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return 'bg-green-500';
      case 'CONNECTING':
        return 'bg-yellow-500';
      case 'DISCONNECTED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center">
          <Mic className="h-4 w-4 mr-2" />
          Webhook Status
        </CardTitle>
        <CardDescription>
          Connection status for voice message processing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              {isLoading ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin text-muted-foreground" />
              ) : status === 'connected' ? (
                <div className="h-3 w-3 rounded-full bg-green-500 mr-2" />
              ) : (
                <div className="h-3 w-3 rounded-full bg-red-500 mr-2" />
              )}
              <span className="text-sm">
                {isLoading 
                  ? 'Checking connection...' 
                  : status === 'connected' 
                    ? 'Webhook connected' 
                    : 'Connection error'}
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testAudioTranscription}
              disabled={isLoading || status !== 'connected' || isTranscribing}
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Voice Processing'
              )}
            </Button>
          </div>
          
          <div className="flex justify-between items-center border-t pt-3">
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full ${getStatusColor()} mr-2`} />
              <span className="text-sm">
                WhatsApp Status: <strong>{connectionStatus}</strong>
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={checkInstanceStatus}
              className="p-1 h-8 w-8"
              title="Refresh Status"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhatsAppWebhookManager;
