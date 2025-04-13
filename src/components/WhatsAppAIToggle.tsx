
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';

interface WhatsAppAIToggleProps {
  instanceId: string;
  instanceName: string;
}

const WhatsAppAIToggle: React.FC<WhatsAppAIToggleProps> = ({
  instanceId,
  instanceName
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
      } = await supabase.from('whatsapp_ai_config').select('is_active').eq('whatsapp_instance_id', instanceId).single();
      if (error) {
        if (error.code === 'PGRST116') {
          setIsEnabled(false);
        } else {
          throw error;
        }
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
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', instanceId).single();
      if (checkError && checkError.code !== 'PGRST116') {
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

  return (
    <div className="space-y-2 mt-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="ai-toggle" className="text-base">
          Enable AI Responses
        </Label>
        <Switch
          id="ai-toggle"
          checked={isEnabled}
          onCheckedChange={toggleAI}
          disabled={isLoading || isUpdating}
          className="data-[state=checked]:bg-green-500"
        />
      </div>
      {isLoading && <div className="flex items-center justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>}
    </div>
  );
};

export default WhatsAppAIToggle;
