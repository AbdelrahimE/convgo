
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';

export interface PromptGenerationStats {
  limit: number;
  used: number;
  remaining: number;
  resetsOn: string | null;
}

export function usePromptGenerationStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PromptGenerationStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('monthly_prompt_generations_limit, monthly_prompt_generations_used, last_prompt_generations_reset_date')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setStats({
          limit: data.monthly_prompt_generations_limit,
          used: data.monthly_prompt_generations_used,
          remaining: data.monthly_prompt_generations_limit - data.monthly_prompt_generations_used,
          resetsOn: data.last_prompt_generations_reset_date
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch prompt generation stats';
      logger.error('Error fetching prompt generation stats:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refreshStats: fetchStats
  };
}
