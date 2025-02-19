
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, session } = useAuth();
  const location = useLocation();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [lastValidAuth, setLastValidAuth] = useState({
    hasUser: !!user,
    hasSession: !!session
  });

  // Update last valid auth state when we have valid auth
  useEffect(() => {
    if (user && session) {
      setLastValidAuth({
        hasUser: true,
        hasSession: true
      });
    }
  }, [user, session]);

  // Detailed state logging
  console.debug('ProtectedRoute state:', { 
    user: user ? {
      id: user.id,
      email: user.email,
      role: user.role,
      lastSignIn: user.last_sign_in_at
    } : null,
    loading,
    pathname: location.pathname,
    isAuthRoute: location.pathname === '/auth',
    sessionStatus: session ? {
      hasToken: !!session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'
    } : 'no session',
    lastValidAuth,
    shouldRedirect
  });

  // Don't protect the auth route itself
  if (location.pathname === '/auth') {
    console.debug('On auth route, proceeding without protection');
    return <>{children}</>;
  }

  // Show loading state while checking authentication
  if (loading) {
    console.debug('Auth state is loading');
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // More conservative redirect logic
  useEffect(() => {
    let redirectTimeout: NodeJS.Timeout;

    // Only consider redirecting if we're not loading and have no auth
    if (!loading && (!user || !session)) {
      console.debug('Starting redirect evaluation:', {
        hasUser: !!user,
        hasSession: !!session,
        hadPreviousAuth: lastValidAuth.hasUser && lastValidAuth.hasSession
      });

      // If we previously had valid auth, wait a brief moment before redirecting
      if (lastValidAuth.hasUser && lastValidAuth.hasSession) {
        redirectTimeout = setTimeout(() => {
          console.debug('Grace period ended, checking auth state again');
          // Double-check auth state before redirecting
          if (!user || !session) {
            console.debug('Auth still invalid after grace period, setting redirect');
            setShouldRedirect(true);
          }
        }, 250); // 250ms grace period
      } else {
        // If we never had auth, redirect immediately
        console.debug('No previous auth detected, setting redirect immediately');
        setShouldRedirect(true);
      }
    } else {
      // Reset redirect flag if we have valid auth
      setShouldRedirect(false);
    }

    return () => {
      clearTimeout(redirectTimeout);
    };
  }, [user, session, loading, lastValidAuth]);

  // Only redirect if we're absolutely sure
  if (shouldRedirect && !loading) {
    console.debug('Executing redirect to auth page', {
      hasUser: !!user,
      hasSession: !!session,
      loading
    });
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  console.debug('Route is protected and proceeding with render');
  return <>{children}</>;
}
