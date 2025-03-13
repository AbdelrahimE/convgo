
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

const WhatsAppWebhookManager: React.FC<{ instanceName: string }> = ({ instanceName }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [status, setStatus] = useState<'unregistered' | 'registering' | 'registered' | 'error'>('unregistered');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookConfig, setWebhookConfig] = useState<{
    id?: string;
    webhook_url?: string;
    is_active?: boolean;
    last_status?: string;
    last_checked_at?: string;
  } | null>(null);

  // Check webhook status on load
  useEffect(() => {
    if (instanceName) {
      checkWebhookStatus();
    }
  }, [instanceName]);

  const checkWebhookStatus = async () => {
    try {
      if (!instanceName) return;
      
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: { action: 'status' }
      });
      
      if (error) throw error;
      
      if (data.success && data.activeWebhooks) {
        const instanceWebhook = data.activeWebhooks.find(
          (webhook: any) => webhook.instance_name === instanceName
        );
        
        if (instanceWebhook) {
          setStatus('registered');
          setWebhookConfig(instanceWebhook);
          setWebhookUrl(instanceWebhook.webhook_url || '');
          setErrorMessage(null);
        } else {
          setStatus('unregistered');
          setWebhookConfig(null);
        }
      } else {
        setStatus('unregistered');
        setWebhookConfig(null);
      }
    } catch (error) {
      console.error('Error checking webhook status:', error);
      // Don't show error toast on routine checks
    }
  };

  const registerWebhook = async () => {
    if (!instanceName || !webhookUrl.trim()) {
      toast.error('Please enter a valid webhook URL');
      return;
    }

    try {
      setIsRegistering(true);
      setStatus('registering');
      setErrorMessage(null);
      
      // Call the edge function to register the webhook
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: { 
          action: 'register',
          instanceName: instanceName,
          webhookUrl: webhookUrl.trim()
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success('Webhook registered successfully', {
          description: 'Your WhatsApp instance is now connected to the webhook'
        });
        setStatus('registered');
        await checkWebhookStatus(); // Refresh the status
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Unknown error');
        toast.error('Failed to register webhook', {
          description: data.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error registering webhook:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      toast.error('Error registering webhook');
    } finally {
      setIsRegistering(false);
    }
  };

  const unregisterWebhook = async () => {
    if (!instanceName) {
      toast.error('Instance name is required');
      return;
    }

    try {
      setIsUnregistering(true);
      
      // Call the edge function to unregister the webhook
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: { 
          action: 'unregister',
          instanceName: instanceName
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success('Webhook unregistered successfully');
        setStatus('unregistered');
        setWebhookConfig(null);
        setErrorMessage(null);
      } else {
        toast.error('Failed to unregister webhook', {
          description: data.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error unregistering webhook:', error);
      toast.error('Error unregistering webhook');
    } finally {
      setIsUnregistering(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>WhatsApp Webhook Connection</CardTitle>
        <CardDescription>
          Manage the webhook connection between your WhatsApp instance and the AI system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-4">
          <div 
            className={`w-3 h-3 rounded-full ${
              status === 'registered' 
                ? 'bg-green-500' 
                : status === 'registering' 
                  ? 'bg-yellow-500' 
                  : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-500'
            }`}
          />
          <span className="text-sm font-medium">
            {status === 'registered' 
              ? 'Webhook registered and active' 
              : status === 'registering' 
                ? 'Registering webhook...' 
                : status === 'error'
                  ? 'Webhook error'
                  : 'No webhook registered'}
          </span>
        </div>
        
        {status === 'registered' && webhookConfig && (
          <div className="mt-2 text-sm mb-4">
            <p className="font-medium">Current Webhook URL:</p>
            <p className="text-muted-foreground break-all mt-1">{webhookConfig.webhook_url}</p>
            <p className="mt-2">
              <span className="font-medium">Status: </span>
              <span>{webhookConfig.last_status || 'Unknown'}</span>
            </p>
            {webhookConfig.last_checked_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Last checked: {new Date(webhookConfig.last_checked_at).toLocaleString()}
              </p>
            )}
          </div>
        )}
        
        {status !== 'registered' && (
          <div className="mb-4">
            <p className="text-sm mb-2">Webhook URL:</p>
            <Input
              type="url"
              placeholder="https://your-endpoint.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={isRegistering}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the webhook URL where WhatsApp messages should be sent
            </p>
          </div>
        )}
        
        {status === 'error' && errorMessage && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md flex items-start space-x-2 mb-4">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        )}
        
        <div className="mt-2 text-sm text-muted-foreground">
          <p>
            When registered, the AI system will receive incoming WhatsApp messages via this webhook
            and automatically respond using the configured system prompts and knowledge base files.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        {status === 'registered' ? (
          <Button 
            onClick={unregisterWebhook} 
            disabled={isUnregistering}
            variant="destructive"
            className="w-full"
          >
            {isUnregistering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unregistering...
              </>
            ) : (
              'Unregister Webhook'
            )}
          </Button>
        ) : (
          <Button 
            onClick={registerWebhook} 
            disabled={isRegistering || !webhookUrl.trim()}
            className="w-full"
          >
            {isRegistering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registering...
              </>
            ) : (
              'Register Webhook'
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default WhatsAppWebhookManager;
