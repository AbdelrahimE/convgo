import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Interfaces
export interface SupportNumber {
  id: string;
  whatsapp_number: string;
  is_active: boolean;
  created_at: string;
}

export interface InstanceSettings {
  id: string;
  instance_name: string;
  escalation_enabled: boolean;
  escalation_message: string;
  escalated_conversation_message: string;
  escalation_keywords: string[];
  smart_escalation_enabled: boolean;
  keyword_escalation_enabled: boolean;
}

export interface EscalatedConversation {
  id: string;
  whatsapp_number: string;
  instance_id: string;
  escalated_at: string;
  reason: string;
  conversation_context: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  resolved_at: string | null;
  resolved_by: string | null;
  instance?: {
    instance_name: string;
  };
}

// Custom hook for support numbers
export function useSupportNumbers() {
  return useQuery({
    queryKey: ['supportNumbers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_team_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SupportNumber[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Custom hook for WhatsApp instances
export function useWhatsAppInstances(userId?: string) {
  return useQuery({
    queryKey: ['whatsappInstances', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, escalation_enabled, escalation_message, escalated_conversation_message, escalation_keywords, smart_escalation_enabled, keyword_escalation_enabled')
        .eq('user_id', userId);

      if (error) throw error;
      return (data || []) as InstanceSettings[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Custom hook for escalated conversations
export function useEscalatedConversations(instanceId: string, filter: 'all' | 'active' | 'resolved') {
  return useQuery({
    queryKey: ['escalatedConversations', instanceId, filter],
    queryFn: async () => {
      let query = supabase
        .from('escalated_conversations')
        .select(`
          *,
          instance:whatsapp_instances(instance_name)
        `)
        .eq('instance_id', instanceId)
        .order('escalated_at', { ascending: false });

      if (filter === 'active') {
        query = query.is('resolved_at', null);
      } else if (filter === 'resolved') {
        query = query.not('resolved_at', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as EscalatedConversation[];
    },
    enabled: !!instanceId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });
}

// Mutation for adding support number
export function useAddSupportNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, whatsappNumber }: { userId: string; whatsappNumber: string }) => {
      const { error } = await supabase
        .from('support_team_numbers')
        .insert({
          user_id: userId,
          whatsapp_number: whatsappNumber.trim()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportNumbers'] });
      toast.success('Support number added successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to add support number');
    }
  });
}

// Mutation for toggling number status
export function useToggleNumberStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
      const { error } = await supabase
        .from('support_team_numbers')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportNumbers'] });
    },
    onError: () => {
      toast.error('Failed to update number status');
    }
  });
}

// Mutation for deleting support number
export function useDeleteSupportNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('support_team_numbers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportNumbers'] });
      toast.success('Support number deleted');
    },
    onError: () => {
      toast.error('Failed to delete number');
    }
  });
}

// Mutation for updating instance settings
export function useUpdateInstanceSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceId, field, value }: { instanceId: string; field: string; value: any }) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ [field]: value })
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsappInstances'] });
      toast.success('Settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update settings');
    }
  });
}

// Mutation for saving instance settings
export function useSaveInstanceSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      settings 
    }: { 
      instanceId: string; 
      settings: {
        escalation_message: string;
        escalated_conversation_message: string;
        escalation_keywords: string[];
      }
    }) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update(settings)
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsappInstances'] });
      toast.success('Settings saved successfully');
    },
    onError: () => {
      toast.error('Failed to save settings');
    }
  });
}

// Mutation for resolving escalation
export function useResolveEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      phoneNumber, 
      instanceId, 
      resolvedBy 
    }: { 
      phoneNumber: string; 
      instanceId: string; 
      resolvedBy: string; 
    }) => {
      const { error } = await supabase.rpc('resolve_escalation', {
        p_phone_number: phoneNumber,
        p_instance_id: instanceId,
        p_resolved_by: resolvedBy
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedConversations'] });
      toast.success('Escalation resolved successfully, conversation returned to AI');
    },
    onError: () => {
      toast.error('Failed to resolve escalation');
    }
  });
}