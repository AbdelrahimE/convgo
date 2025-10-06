/**
 * Session Expiry Notification Component
 *
 * This component monitors the user's session and displays warnings
 * when the session is about to expire. It provides options to:
 * - Extend the session automatically
 * - Show countdown timer
 * - Allow manual session refresh
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import logger from '@/utils/logger';
import { sessionManager } from '@/utils/sessionManager';

interface SessionExpiryNotificationProps {
  // Number of minutes before expiry to show warning (default: 10)
  warningMinutes?: number;
  // Whether to auto-refresh session when warning appears (default: true)
  autoRefresh?: boolean;
}

export function SessionExpiryNotification({
  warningMinutes = 10,
  autoRefresh = true,
}: SessionExpiryNotificationProps) {
  const { session } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate time remaining until session expires
  useEffect(() => {
    if (!session?.expires_at) {
      setShowWarning(false);
      return;
    }

    const checkExpiry = () => {
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const minutesRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

      setTimeRemaining(Math.max(0, minutesRemaining));

      // Show warning if session expires soon
      if (minutesRemaining > 0 && minutesRemaining <= warningMinutes) {
        setShowWarning(true);

        // Auto-refresh if enabled and not already refreshing
        if (autoRefresh && !isRefreshing) {
          handleRefreshSession();
        }
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkExpiry();

    // Check every 3 minutes to reduce API calls - session expires after long time anyway
    // Reduced from 1 minute to 3 minutes for better performance
    const interval = setInterval(checkExpiry, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session, warningMinutes, autoRefresh, isRefreshing]);

  const handleRefreshSession = async () => {
    setIsRefreshing(true);

    try {
      logger.log('SessionExpiryNotification: User initiated session refresh via SessionManager');

      // Use centralized sessionManager to prevent concurrent refresh attempts
      const success = await sessionManager.refreshSession();

      if (!success) {
        logger.error('SessionExpiryNotification: Failed to refresh session via SessionManager');
        toast.error('Session Refresh Failed', {
          description: 'Could not extend your session. Please sign in again.',
        });
        return;
      }

      logger.log('SessionExpiryNotification: Session refreshed successfully via SessionManager');
      toast.success('Session Extended', {
        description: 'Your session has been extended successfully.',
      });
      setShowWarning(false);
    } catch (error) {
      logger.error('SessionExpiryNotification: Exception during session refresh:', error);
      toast.error('Session Refresh Failed', {
        description: 'An error occurred. Please try again.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTimeRemaining = (minutes: number): string => {
    if (minutes < 1) {
      return 'less than a minute';
    }

    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);

    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }

    return `${mins} minute${mins !== 1 ? 's' : ''}`;
  };

  // Don't render if not showing warning
  if (!showWarning) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top-5">
      <Alert variant="default" className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200">
          Session Expiring Soon
        </AlertTitle>
        <AlertDescription className="mt-2 text-yellow-700 dark:text-yellow-300">
          <p className="mb-3">
            Your session will expire in{' '}
            <span className="font-semibold">{formatTimeRemaining(timeRemaining)}</span>.
            {autoRefresh && isRefreshing && ' Extending automatically...'}
          </p>

          {!autoRefresh && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshSession}
              disabled={isRefreshing}
              className="gap-2 border-yellow-300 hover:bg-yellow-100"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Extending...' : 'Extend Session'}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
