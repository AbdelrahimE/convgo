
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, session } = useAuth();
  const location = useLocation();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [lastValidAuth, setLastValidAuth] = useState({
    hasUser: false,
    hasSession: false
  });

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

  // Combined effect for auth state management
  useEffect(() => {
    let redirectTimeout: NodeJS.Timeout;

    // Update last valid auth state when we have valid auth
    if (user && session) {
      setLastValidAuth({
        hasUser: true,
        hasSession: true
      });
      setShouldRedirect(false);
      return;
    }

    // Don't process redirect logic for auth route
    if (location.pathname === '/auth') {
      return;
    }

    // Only consider redirecting if we're not loading and have no auth
    if (!loading && (!user || !session)) {
      // If we previously had valid auth, wait before redirecting
      if (lastValidAuth.hasUser && lastValidAuth.hasSession) {
        redirectTimeout = setTimeout(() => {
          // Double-check auth state before redirecting
          if (!user || !session) {
            setShouldRedirect(true);
          }
        }, 250); // 250ms grace period
      } else {
        // If we never had auth, redirect immediately
        setShouldRedirect(true);
      }
    }

    return () => {
      clearTimeout(redirectTimeout);
    };
  }, [user, session, loading, location.pathname, lastValidAuth]);

  // Don't protect the auth route itself
  if (location.pathname === '/auth') {
    return <>{children}</>;
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only redirect if we're absolutely sure
  if (shouldRedirect && !loading) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
