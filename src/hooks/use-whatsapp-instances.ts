import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  last_connected: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  reject_calls: boolean;
  reject_calls_message: string | null;
  escalation_enabled: boolean | null;
  escalation_message: string | null;
  escalated_conversation_message: string | null;
  escalation_keywords: string[] | null;
  smart_escalation_enabled: boolean | null;
  keyword_escalation_enabled: boolean | null;
}

export const useWhatsAppInstances = (userId?: string) => {
  return useQuery({
    queryKey: ['whatsapp-instances', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching WhatsApp instances:', error);
        throw error;
      }

      return data as WhatsAppInstance[];
    },
    enabled: !!userId,
  });
};

export const useWhatsAppInstance = (instanceId?: string) => {
  return useQuery({
    queryKey: ['whatsapp-instance', instanceId],
    queryFn: async () => {
      if (!instanceId) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        console.error('Error fetching WhatsApp instance:', error);
        throw error;
      }

      return data as WhatsAppInstance;
    },
    enabled: !!instanceId,
  });
};