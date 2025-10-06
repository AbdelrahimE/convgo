
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPendingPasswordReset: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isPendingPasswordReset: false,
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPendingPasswordReset, setIsPendingPasswordReset] = useState(false);

  useEffect(() => {
    logger.log('AuthProvider mounted');
    
    // Check if user is in pending password reset state
    const pendingReset = localStorage.getItem('pendingPasswordReset') === 'true';
    setIsPendingPasswordReset(pendingReset);
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      logger.log('Initial session:', session);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes with comprehensive event handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logger.log('Auth state changed - Event:', event, 'Session:', session);

      // Handle different authentication events
      switch (event) {
        case 'SIGNED_IN':
          logger.log('User signed in successfully:', session?.user?.email);
          // Clear any pending password reset flags
          localStorage.removeItem('pendingPasswordReset');
          setIsPendingPasswordReset(false);
          break;

        case 'SIGNED_OUT':
          logger.log('User signed out - cleaning up state');
          // Clear all auth-related data from localStorage
          localStorage.removeItem('pendingPasswordReset');
          // Clear any cached query data if needed
          // Note: QueryClient invalidation should be handled at the App level
          setIsPendingPasswordReset(false);
          break;

        case 'TOKEN_REFRESHED':
          logger.log('Session token refreshed successfully');
          // Token refresh is automatic, just log for monitoring
          break;

        case 'USER_UPDATED':
          logger.log('User data updated:', session?.user?.email);
          break;

        case 'PASSWORD_RECOVERY':
          logger.log('Password recovery initiated');
          localStorage.setItem('pendingPasswordReset', 'true');
          setIsPendingPasswordReset(true);
          break;

        default:
          logger.log('Unhandled auth event:', event);
      }

      // Check pending password reset state on auth changes
      const pendingReset = localStorage.getItem('pendingPasswordReset') === 'true';
      setIsPendingPasswordReset(pendingReset);

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for localStorage changes (for pendingPasswordReset)
    const handleStorageChange = () => {
      const pendingReset = localStorage.getItem('pendingPasswordReset') === 'true';
      setIsPendingPasswordReset(pendingReset);
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const value = {
    session,
    user,
    loading,
    isPendingPasswordReset
  };

  logger.log('AuthProvider rendering with:', value);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
