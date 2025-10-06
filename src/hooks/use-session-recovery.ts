/**
 * Session Recovery Hook
 *
 * This hook manages session recovery state and provides utilities
 * to trigger recovery dialogs when session issues occur.
 *
 * Usage:
 * ```typescript
 * const { showRecoveryDialog, triggerRecovery, closeRecovery } = useSessionRecovery();
 *
 * // In error handling
 * if (error.status === 401) {
 *   triggerRecovery('Your session has expired');
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import logger from '@/utils/logger';

interface SessionRecoveryState {
  isOpen: boolean;
  message: string;
}

export function useSessionRecovery() {
  const [recoveryState, setRecoveryState] = useState<SessionRecoveryState>({
    isOpen: false,
    message: 'Your session has expired or become invalid.',
  });

  /**
   * Triggers the session recovery dialog
   */
  const triggerRecovery = useCallback((customMessage?: string) => {
    logger.warn('Session recovery triggered:', customMessage);

    setRecoveryState({
      isOpen: true,
      message: customMessage || 'Your session has expired or become invalid.',
    });
  }, []);

  /**
   * Closes the session recovery dialog
   */
  const closeRecovery = useCallback(() => {
    logger.log('Session recovery dialog closed');

    setRecoveryState(prev => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  /**
   * Handles successful session recovery
   */
  const handleRecoverySuccess = useCallback(() => {
    logger.log('Session recovered successfully - closing dialog');
    closeRecovery();
  }, [closeRecovery]);

  return {
    showRecoveryDialog: recoveryState.isOpen,
    recoveryMessage: recoveryState.message,
    triggerRecovery,
    closeRecovery,
    handleRecoverySuccess,
  };
}
