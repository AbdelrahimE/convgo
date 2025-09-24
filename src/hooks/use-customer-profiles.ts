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

// Get customer profiles for a specific instance with pagination
export const useCustomerProfiles = (instanceId?: string, page: number = 1, pageSize: number = 50) => {
  return useQuery({
    queryKey: ['customer-profiles', instanceId, page, pageSize],
    queryFn: async () => {
      if (!instanceId) return { profiles: [], total: 0 };
      
      // Calculate offset for pagination
      const offset = (page - 1) * pageSize;
      
      // Fetch profiles with pagination
      const { data: profiles, error, count } = await supabase
        .from('customer_profiles')
        .select('*', { count: 'exact' })
        .eq('whatsapp_instance_id', instanceId)
        .order('last_interaction', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Error fetching customer profiles:', error);
        throw error;
      }

      return {
        profiles: profiles as CustomerProfile[],
        total: count || 0,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    },
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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
    onMutate: async ({ instanceId, phoneNumber, updates }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ 
        queryKey: ['customer-profiles-advanced', instanceId] 
      });
      await queryClient.cancelQueries({ 
        queryKey: ['customer-profile', instanceId, phoneNumber] 
      });

      // Snapshot the previous values for rollback
      const previousProfilesData = queryClient.getQueriesData({ 
        queryKey: ['customer-profiles-advanced', instanceId] 
      });
      const previousProfileData = queryClient.getQueryData([
        'customer-profile', instanceId, phoneNumber
      ]);

      // Optimistically update the cache
      queryClient.setQueriesData(
        { queryKey: ['customer-profiles-advanced', instanceId] },
        (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            profiles: oldData.profiles?.map((profile: CustomerProfile) => 
              profile.phone_number === phoneNumber 
                ? { ...profile, ...updates, updated_at: new Date().toISOString() }
                : profile
            ) || []
          };
        }
      );

      // Update individual profile cache
      queryClient.setQueryData(
        ['customer-profile', instanceId, phoneNumber],
        (oldProfile: CustomerProfile | undefined) => 
          oldProfile ? { ...oldProfile, ...updates, updated_at: new Date().toISOString() } : undefined
      );

      // Return context with previous data for potential rollback
      return { previousProfilesData, previousProfileData };
    },
    onError: (err, variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousProfilesData) {
        context.previousProfilesData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousProfileData) {
        queryClient.setQueryData(
          ['customer-profile', variables.instanceId, variables.phoneNumber],
          context.previousProfileData
        );
      }
    },
    onSuccess: (data) => {
      // Update cache with server response (in case server modified the data)
      queryClient.setQueriesData(
        { queryKey: ['customer-profiles-advanced', data.whatsapp_instance_id] },
        (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            profiles: oldData.profiles?.map((profile: CustomerProfile) => 
              profile.id === data.id ? data : profile
            ) || []
          };
        }
      );

      queryClient.setQueryData(
        ['customer-profile', data.whatsapp_instance_id, data.phone_number],
        data
      );
    },
    onSettled: (data) => {
      // Always refetch in background to ensure consistency
      if (data) {
        queryClient.invalidateQueries({ 
          queryKey: ['customer-profiles-stats', data.whatsapp_instance_id] 
        });
      }
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

// Get customer profiles statistics - optimized to fetch only necessary data
export const useCustomerProfilesStats = (instanceId?: string) => {
  return useQuery({
    queryKey: ['customer-profiles-stats', instanceId],
    queryFn: async () => {
      if (!instanceId) return null;
      
      // Optimized query - only fetch required fields for statistics
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
    staleTime: 10 * 60 * 1000, // 10 minutes - stats change less frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

// Advanced search interface for server-side filtering
export interface AdvancedSearchFilters {
  searchTerm?: string;
  stageFilter?: string;
  intentFilter?: string;
  moodFilter?: string;
  urgencyFilter?: string;
}

// Advanced hook with server-side filtering and search
export const useCustomerProfilesWithAdvancedSearch = (
  instanceId?: string, 
  page: number = 1, 
  pageSize: number = 50,
  filters: AdvancedSearchFilters = {}
) => {
  return useQuery({
    queryKey: [
      'customer-profiles-advanced', 
      instanceId, 
      page, 
      pageSize, 
      filters.searchTerm,
      filters.stageFilter,
      filters.intentFilter,
      filters.moodFilter,
      filters.urgencyFilter
    ],
    queryFn: async () => {
      if (!instanceId) return { profiles: [], stats: null, pagination: null };
      
      // Use the advanced search stored procedure
      const { data: searchResult, error: searchError } = await supabase
        .rpc('search_customer_profiles', {
          p_instance_id: instanceId,
          p_search_term: filters.searchTerm || null,
          p_stage_filter: filters.stageFilter || 'all',
          p_intent_filter: filters.intentFilter || 'all',
          p_mood_filter: filters.moodFilter || 'all',
          p_urgency_filter: filters.urgencyFilter || 'all',
          p_page: page,
          p_page_size: pageSize
        });

      if (searchError) {
        console.error('Error in advanced search:', searchError);
        throw searchError;
      }

      // Get statistics separately (optimized query)
      const { data: statsResult, error: statsError } = await supabase
        .from('customer_profiles')
        .select('customer_stage, total_messages, ai_interactions')
        .eq('whatsapp_instance_id', instanceId);

      if (statsError) {
        console.error('Error fetching customer profiles stats:', statsError);
        throw statsError;
      }

      // Calculate statistics
      const statsData = statsResult;
      const total = statsData.length;
      const stageStats = statsData.reduce((acc, profile) => {
        acc[profile.customer_stage] = (acc[profile.customer_stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalMessages = statsData.reduce((sum, profile) => sum + (profile.total_messages || 0), 0);
      const totalInteractions = statsData.reduce((sum, profile) => sum + (profile.ai_interactions || 0), 0);

      const stats = {
        total,
        filtered: searchResult?.[0]?.filtered_count || 0,
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

      // Extract search results
      const searchData = searchResult?.[0];
      const profiles = searchData?.profiles || [];
      const pageInfo = searchData?.page_info || {};

      const pagination = {
        currentPage: page,
        pageSize,
        total: searchData?.total_count || 0,
        filtered: searchData?.filtered_count || 0,
        totalPages: pageInfo.totalPages || 0,
        hasNextPage: pageInfo.hasNextPage || false,
        hasPrevPage: pageInfo.hasPrevPage || false
      };

      return {
        profiles: profiles as CustomerProfile[],
        stats,
        pagination
      };
    },
    enabled: !!instanceId,
    staleTime: 2 * 60 * 1000, // 2 minutes (faster refresh for search results)
    gcTime: 10 * 60 * 1000, // 10 minutes
    // Background refetch for real-time updates
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchIntervalInBackground: true,
  });
};

// Backward compatibility - updated to use advanced search under the hood
export const useCustomerProfilesWithStats = (instanceId?: string, page: number = 1, pageSize: number = 50) => {
  return useCustomerProfilesWithAdvancedSearch(instanceId, page, pageSize, {});
};