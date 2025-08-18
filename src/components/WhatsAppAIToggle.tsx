
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';

interface WhatsAppAIToggleProps {
  instanceId: string;
  instanceName: string;
  instanceStatus?: string; // Make this optional to maintain backward compatibility
  variant?: 'simple' | 'detailed'; // Add variant prop to control the display style
}

const WhatsAppAIToggle: React.FC<WhatsAppAIToggleProps> = ({
  instanceId,
  instanceName,
  instanceStatus,
  variant = 'simple' // Default to simple variant for backward compatibility
}) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (instanceId) {
      fetchAIStatus();
    }
  }, [instanceId]);

  const fetchAIStatus = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_ai_config').select('is_active').eq('whatsapp_instance_id', instanceId).maybeSingle();
      if (error) {
        throw error;
      } else if (!data) {
        setIsEnabled(false);
      } else {
        setIsEnabled(data.is_active || false);
      }
    } catch (error) {
      logger.error('Error fetching AI status:', error);
      toast.error('Failed to load AI status');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAI = async () => {
    try {
      setIsUpdating(true);
      const newStatus = !isEnabled;
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', instanceId).maybeSingle();
      if (checkError) {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').update({
          is_active: newStatus,
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').insert({
          whatsapp_instance_id: instanceId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          system_prompt: 'You are a helpful AI assistant. Answer questions based on the context provided.',
          temperature: 1.0,
          is_active: newStatus
        });
        if (error) throw error;
      }
      setIsEnabled(newStatus);
      toast.success(`AI responses ${newStatus ? 'enabled' : 'disabled'} for ${instanceName}`);
    } catch (error) {
      logger.error('Error toggling AI status:', error);
      toast.error('Failed to update AI status');
    } finally {
      setIsUpdating(false);
    }
  };

  // Check if the instance is connected before allowing toggle
  const isInstanceConnected = instanceStatus === 'Connected';

  // Render simple toggle version (used in instance cards)
  if (variant === 'simple') {
    return (
      <div className="flex items-center justify-center">
        <Switch
          id={`ai-toggle-${instanceId}`}
          checked={isEnabled}
          onCheckedChange={toggleAI}
          disabled={isLoading || isUpdating || (instanceStatus && !isInstanceConnected)}
          className="data-[state=checked]:bg-green-500"
        />
      </div>
    );
  }

  // Render detailed toggle version (used in AI Configuration page)
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Zap className="h-5 w-5 mr-2 text-amber-500" />
            <CardTitle className="text-xl font-semibold">AI Auto-Response Status</CardTitle>
          </div>
          <Switch
            id={`ai-toggle-${instanceId}`}
            checked={isEnabled}
            onCheckedChange={toggleAI}
            disabled={isLoading || isUpdating || (instanceStatus && !isInstanceConnected)}
            className="data-[state=checked]:bg-green-500"
          />
        </div>
        <CardDescription>
          Enable or disable AI responses for incoming WhatsApp messages
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center py-2">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading status...</span>
          </div>
        ) : isEnabled ? (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md p-3">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              AI responses are enabled
            </p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              This WhatsApp number will automatically respond to incoming messages using AI
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-md p-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
              AI responses are disabled
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">
              This WhatsApp number will not automatically respond to messages
            </p>
          </div>
        )}
        {instanceStatus && !isInstanceConnected && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-3 mt-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              WhatsApp connection required
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              Connect your WhatsApp instance to enable AI responses
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppAIToggle;
