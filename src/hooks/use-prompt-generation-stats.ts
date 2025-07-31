import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';
import { differenceInDays, differenceInHours, differenceInMinutes, addDays } from 'date-fns';

export interface PromptGenerationStats {
  limit: number;
  used: number;
  remaining: number;
  resetsOn: string | null;
  timeUntilReset: {
    days: number;
    hours: number;
    minutes: number;
  } | null;
}

export function usePromptGenerationStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PromptGenerationStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateTimeUntilReset = (resetDate: string | null): { days: number; hours: number; minutes: number; } | null => {
    if (!resetDate) return null;
    
    const resetDateTime = new Date(resetDate);
    const nextResetDate = addDays(resetDateTime, 30);
    const now = new Date();

    // If we're past the reset date, return null to trigger a refresh
    if (now > nextResetDate) {
      return null;
    }

    const days = differenceInDays(nextResetDate, now);
    const hours = differenceInHours(nextResetDate, now) % 24;
    const minutes = differenceInMinutes(nextResetDate, now) % 60;

    return { days, hours, minutes };
  };

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
        const timeUntilReset = calculateTimeUntilReset(data.last_prompt_generations_reset_date);
        
        // If timeUntilReset is null and we have a reset date, it means we're past due
        // The backend job will handle the reset, but we can show 0 remaining time
        const displayTimeUntilReset = timeUntilReset || { days: 0, hours: 0, minutes: 0 };

        setStats({
          limit: data.monthly_prompt_generations_limit,
          used: data.monthly_prompt_generations_used,
          remaining: data.monthly_prompt_generations_limit - data.monthly_prompt_generations_used,
          resetsOn: data.last_prompt_generations_reset_date,
          timeUntilReset: displayTimeUntilReset
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
    
    const intervalId = setInterval(fetchStats, 60000);
    
    return () => clearInterval(intervalId);
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refreshStats: fetchStats
  };
}
