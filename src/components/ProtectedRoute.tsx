
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, session } = useAuth();
  const location = useLocation();

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
    } : 'no session'
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

  // Detailed check before redirect
  if (!user || !session) {
    console.debug('Redirect check details:', {
      hasUser: !!user,
      hasSession: !!session,
      sessionToken: session ? '[PRESENT]' : '[MISSING]',
      loading
    });

    if (!loading) {
      console.debug('Redirecting to auth, authentication required');
      return <Navigate to="/auth" state={{ from: location }} replace />;
    }
  }

  console.debug('Route is protected and user is authenticated, proceeding');
  return <>{children}</>;
}
