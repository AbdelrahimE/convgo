import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import logger from '@/utils/logger';
import { SessionRecoveryDialog } from './SessionRecoveryDialog';
import { useSessionRecovery } from '@/hooks/use-session-recovery';
import { sessionManager } from '@/utils/sessionManager';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isPendingPasswordReset, session } = useAuth();
  const [isValidatingSession, setIsValidatingSession] = useState(false);
  const {
    showRecoveryDialog,
    recoveryMessage,
    triggerRecovery,
    closeRecovery,
    handleRecoverySuccess,
  } = useSessionRecovery();

  // Validate and refresh session if needed
  // NOTE: We only depend on [user], not [session], to avoid infinite loops
  // The session will be updated via AuthContext's onAuthStateChange automatically
  useEffect(() => {
    async function validateSession() {
      if (!user || !session) return;

      // Use centralized sessionManager to check validity
      // Buffer time is 2 minutes by default (more conservative than before)
      if (!sessionManager.isSessionValid(session, 2)) {
        logger.warn('ProtectedRoute: Session is invalid or about to expire, attempting refresh via SessionManager');
        setIsValidatingSession(true);

        try {
          // Use centralized sessionManager to refresh
          // This prevents concurrent refresh attempts from multiple sources
          const success = await sessionManager.refreshSession();

          if (!success) {
            logger.error('ProtectedRoute: Failed to refresh session via SessionManager');
            // Trigger recovery dialog for user action
            triggerRecovery('Your session could not be refreshed. Please sign in again to continue.');
          } else {
            logger.log('ProtectedRoute: Session refreshed successfully via SessionManager');
            // AuthContext will be updated automatically via onAuthStateChange
          }
        } catch (error) {
          logger.error('ProtectedRoute: Exception during session validation:', error);
          // Trigger recovery dialog on exception
          triggerRecovery('An error occurred while validating your session. Please sign in again.');
        } finally {
          setIsValidatingSession(false);
        }
      }
    }

    validateSession();
    // IMPORTANT: Only depend on [user], not [session], to prevent infinite refresh loops
    // The session state will be updated by AuthContext automatically
  }, [user, triggerRecovery]);

  if (loading || isValidatingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {isValidatingSession ? 'Validating session...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  // If user has a pending password reset, redirect to reset password page
  if (isPendingPasswordReset) {
    return <Navigate to="/auth/reset-password" replace />;
  }

  return (
    <>
      {children}

      {/* Session Recovery Dialog - shown when session refresh fails */}
      <SessionRecoveryDialog
        isOpen={showRecoveryDialog}
        onClose={closeRecovery}
        message={recoveryMessage}
        onRecoverySuccess={handleRecoverySuccess}
        countdownSeconds={30}
      />
    </>
  );
}
