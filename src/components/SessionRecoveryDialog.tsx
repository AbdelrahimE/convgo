/**
 * Session Recovery Dialog Component
 *
 * This component provides a graceful UI for handling session failures.
 * It appears when:
 * - Session refresh fails
 * - Session becomes invalid
 * - Authentication errors occur
 *
 * Features:
 * - Option to retry session refresh
 * - Option to sign in again
 * - Option to continue as guest (if applicable)
 * - Countdown timer before automatic redirect
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, LogIn, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logger from '@/utils/logger';
import { sessionManager } from '@/utils/sessionManager';

interface SessionRecoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // Countdown in seconds before auto-redirect (default: 30)
  countdownSeconds?: number;
  // Custom message to display
  message?: string;
  // Callback after successful recovery
  onRecoverySuccess?: () => void;
}

export function SessionRecoveryDialog({
  isOpen,
  onClose,
  countdownSeconds = 30,
  message = 'Your session has expired or become invalid.',
  onRecoverySuccess,
}: SessionRecoveryDialogProps) {
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);

  // Countdown timer
  useEffect(() => {
    if (!isOpen) {
      setCountdown(countdownSeconds);
      return;
    }

    if (countdown <= 0) {
      handleSignOut();
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown, countdownSeconds]);

  const handleRetryRefresh = async () => {
    setIsRetrying(true);
    logger.log('SessionRecoveryDialog: User initiated session recovery retry via SessionManager');

    try {
      // Use centralized sessionManager to prevent concurrent refresh attempts
      const success = await sessionManager.refreshSession();

      if (!success) {
        logger.error('SessionRecoveryDialog: Session refresh retry failed via SessionManager');
        toast.error('Recovery Failed', {
          description: 'Could not restore your session. Please sign in again.',
        });
        return;
      }

      logger.log('SessionRecoveryDialog: Session recovered successfully via SessionManager');
      toast.success('Session Restored', {
        description: 'Your session has been restored successfully!',
      });

      // Call success callback if provided
      onRecoverySuccess?.();

      // Close dialog
      onClose();
      setCountdown(countdownSeconds);
    } catch (error) {
      logger.error('SessionRecoveryDialog: Exception during session recovery:', error);
      toast.error('Recovery Error', {
        description: 'An unexpected error occurred. Please try signing in again.',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSignOut = async () => {
    logger.log('User signed out from session recovery dialog');

    try {
      await supabase.auth.signOut();

      toast.info('Signed Out', {
        description: 'You have been signed out. Please sign in to continue.',
      });

      // Navigate to auth page
      navigate('/auth', { replace: true });
      onClose();
    } catch (error) {
      logger.error('Error during sign out:', error);

      // Force navigate even if sign out fails
      navigate('/auth', { replace: true });
      onClose();
    }
  };

  const handleContinue = () => {
    // Just close the dialog and let the app handle the invalid session
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-yellow-600" />
            <AlertDialogTitle className="text-lg">
              Session Expired
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-2">
            <p>{message}</p>
            <p className="text-sm text-muted-foreground">
              You will be automatically signed out in{' '}
              <span className="font-semibold text-yellow-600">{countdown}</span>{' '}
              seconds unless you take action.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleRetryRefresh}
            disabled={isRetrying}
            className="gap-2 w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Button>

          <AlertDialogCancel asChild>
            <Button
              variant="outline"
              onClick={handleContinue}
              className="w-full sm:w-auto"
            >
              Continue
            </Button>
          </AlertDialogCancel>

          <AlertDialogAction asChild>
            <Button
              onClick={handleSignOut}
              className="gap-2 w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              Sign In Again
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
