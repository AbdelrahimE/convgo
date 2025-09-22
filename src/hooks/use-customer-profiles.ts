import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CustomerProfile } from '@/components/customer/CustomerProfileCard';

export interface CustomerProfileUpdate {
  name?: string;
  email?: string;
  company?: string;
  customer_stage?: 'new' | 'interested' | 'customer' | 'loyal';
  tags?: string[];
  conversation_summary?: string;
  key_points?: any[];
  preferences?: any;
  metadata?: any;
  
  // AI-extracted insights
  customer_intent?: 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison';
  customer_mood?: 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused';
  urgency_level?: 'urgent' | 'high' | 'normal' | 'low';
  communication_style?: 'formal' | 'friendly' | 'direct' | 'detailed';
  journey_stage?: 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer';
}

// Get customer profiles for a specific instance
export const useCustomerProfiles = (instanceId?: string) => {
  return useQuery({
    queryKey: ['customer-profiles', instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .order('last_interaction', { ascending: false });

      if (error) {
        console.error('Error fetching customer profiles:', error);
        throw error;
      }

      return data as CustomerProfile[];
    },
    enabled: !!instanceId,
  });
};

// Get a specific customer profile
export const useCustomerProfile = (instanceId?: string, phoneNumber?: string) => {
  return useQuery({
    queryKey: ['customer-profile', instanceId, phoneNumber],
    queryFn: async () => {
      if (!instanceId || !phoneNumber) return null;
      
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .eq('phone_number', phoneNumber)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        console.error('Error fetching customer profile:', error);
        throw error;
      }

      return data as CustomerProfile;
    },
    enabled: !!instanceId && !!phoneNumber,
  });
};

// Update customer profile
export const useUpdateCustomerProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceId,
      phoneNumber,
      updates
    }: {
      instanceId: string;
      phoneNumber: string;
      updates: CustomerProfileUpdate;
    }) => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .update(updates)
        .eq('whatsapp_instance_id', instanceId)
        .eq('phone_number', phoneNumber)
        .select()
        .single();

      if (error) {
        console.error('Error updating customer profile:', error);
        throw error;
      }

      return data as CustomerProfile;
    },
    onSuccess: (data) => {
      // Invalidate and refetch customer profiles
      queryClient.invalidateQueries({ 
        queryKey: ['customer-profiles', data.whatsapp_instance_id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['customer-profile', data.whatsapp_instance_id, data.phone_number] 
      });
    },
  });
};

// Create customer profile
export const useCreateCustomerProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceId,
      phoneNumber,
      profileData
    }: {
      instanceId: string;
      phoneNumber: string;
      profileData?: Partial<CustomerProfile>;
    }) => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .insert({
          whatsapp_instance_id: instanceId,
          phone_number: phoneNumber,
          customer_stage: 'new',
          tags: [],
          key_points: [],
          preferences: {},
          total_messages: 0,
          ai_interactions: 0,
          metadata: {},
          ...profileData
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating customer profile:', error);
        throw error;
      }

      return data as CustomerProfile;
    },
    onSuccess: (data) => {
      // Invalidate and refetch customer profiles
      queryClient.invalidateQueries({ 
        queryKey: ['customer-profiles', data.whatsapp_instance_id] 
      });
    },
  });
};

// Delete customer profile
export const useDeleteCustomerProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceId,
      phoneNumber
    }: {
      instanceId: string;
      phoneNumber: string;
    }) => {
      const { error } = await supabase
        .from('customer_profiles')
        .delete()
        .eq('whatsapp_instance_id', instanceId)
        .eq('phone_number', phoneNumber);

      if (error) {
        console.error('Error deleting customer profile:', error);
        throw error;
      }

      return { instanceId, phoneNumber };
    },
    onSuccess: (data) => {
      // Invalidate and refetch customer profiles
      queryClient.invalidateQueries({ 
        queryKey: ['customer-profiles', data.instanceId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['customer-profile', data.instanceId, data.phoneNumber] 
      });
    },
  });
};

// Get customer profiles statistics
export const useCustomerProfilesStats = (instanceId?: string) => {
  return useQuery({
    queryKey: ['customer-profiles-stats', instanceId],
    queryFn: async () => {
      if (!instanceId) return null;
      
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('customer_stage, total_messages, ai_interactions')
        .eq('whatsapp_instance_id', instanceId);

      if (error) {
        console.error('Error fetching customer profiles stats:', error);
        throw error;
      }

      // Calculate statistics
      const total = data.length;
      const stageStats = data.reduce((acc, profile) => {
        acc[profile.customer_stage] = (acc[profile.customer_stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalMessages = data.reduce((sum, profile) => sum + (profile.total_messages || 0), 0);
      const totalInteractions = data.reduce((sum, profile) => sum + (profile.ai_interactions || 0), 0);

      return {
        total,
        stages: {
          new: stageStats.new || 0,
          interested: stageStats.interested || 0,
          customer: stageStats.customer || 0,
          loyal: stageStats.loyal || 0,
        },
        totalMessages,
        totalInteractions,
        avgMessagesPerCustomer: total > 0 ? Math.round(totalMessages / total) : 0,
        avgInteractionsPerCustomer: total > 0 ? Math.round(totalInteractions / total) : 0,
      };
    },
    enabled: !!instanceId,
  });
};