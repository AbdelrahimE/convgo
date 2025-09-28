import { useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveEscalation } from './use-escalation-queries';

interface UseResolveEscalationDialogOptions {
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

/**
 * Unified hook for handling escalation resolution across different UI components.
 * Provides consistent behavior for resolving escalations with proper loading states,
 * error handling, and success callbacks.
 */
export function useResolveEscalationDialog(options: UseResolveEscalationDialogOptions = {}) {
  const { user } = useAuth();
  const resolveEscalationMutation = useResolveEscalation();

  // Use refs to avoid unnecessary re-renders when callbacks change
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleResolve = useCallback((
    conversationId: string,
    whatsappNumber: string,
    instanceId: string
  ) => {
    if (!user?.id) {
      console.warn('User not authenticated - cannot resolve escalation');
      return;
    }

    // Call the mutation with proper parameters
    resolveEscalationMutation.mutate({
      phoneNumber: whatsappNumber, // Note: API expects phoneNumber, not whatsappNumber
      instanceId: instanceId,
      resolvedBy: user.id
    }, {
      onSuccess: () => {
        // Call the success callback if provided
        optionsRef.current.onSuccess?.();
      },
      onError: (error: any) => {
        // Call the error callback if provided, otherwise the mutation handles it
        optionsRef.current.onError?.(error);
      }
    });
  }, [user?.id, resolveEscalationMutation]);

  return {
    /**
     * Function to resolve an escalation
     * @param conversationId - The ID of the conversation (currently not used by API but kept for future use)
     * @param whatsappNumber - The WhatsApp phone number
     * @param instanceId - The WhatsApp instance ID
     */
    handleResolve,

    /**
     * Whether the resolution is currently in progress
     */
    isLoading: resolveEscalationMutation.isPending,

    /**
     * Any error that occurred during resolution
     */
    error: resolveEscalationMutation.error,

    /**
     * Whether the last resolution was successful
     */
    isSuccess: resolveEscalationMutation.isSuccess,

    /**
     * Reset the mutation state (useful for clearing errors)
     */
    reset: resolveEscalationMutation.reset
  };
}