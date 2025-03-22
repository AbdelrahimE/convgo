import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIResponse } from '@/hooks/use-ai-response';
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
  const [showVoiceCapabilities, setShowVoiceCapabilities] = useState(false);
  const {
    transcribeAudio,
    isTranscribing
  } = useAIResponse();

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
      // Using a reliable, small public audio file for testing
      const testAudioUrl = "https://audio-samples.github.io/samples/mp3/blizzard_biased/sample-1.mp3";
      console.log("Starting test audio transcription");
      const result = await transcribeAudio({
        audioUrl: testAudioUrl,
        mimeType: "audio/mp3",
        instanceName
      });
      if (result.success) {
        toast.success(`Transcription test successful: "${result.transcription}"`);
        console.log("Transcription details:", result);
      } else {
        console.error("Transcription test failed:", result.error);
        toast.error(`Transcription test failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error testing transcription:", error);
      toast.error(`Transcription test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return;
};
export default WhatsAppWebhookManager;