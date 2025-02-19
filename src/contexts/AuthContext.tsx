
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate token format and expiration
  const validateToken = (currentSession: Session | null): boolean => {
    if (!currentSession) {
      console.debug('Token validation: No session provided');
      return false;
    }

    try {
      const { access_token, expires_at } = currentSession;
      console.debug('Token validation check:', { 
        hasAccessToken: !!access_token,
        tokenType: typeof access_token,
        expiresAt: expires_at ? new Date(expires_at * 1000).toISOString() : 'no expiration'
      });
      
      // Check if token exists and has correct format
      if (!access_token || typeof access_token !== 'string') {
        console.error('Token validation failed: Invalid token format');
        return false;
      }

      // Check token expiration
      if (expires_at) {
        const expirationTime = new Date(expires_at * 1000);
        const currentTime = new Date();
        console.debug('Token expiration check:', {
          expirationTime: expirationTime.toISOString(),
          currentTime: currentTime.toISOString(),
          hasExpired: expirationTime <= currentTime
        });

        if (expirationTime <= currentTime) {
          console.error('Token validation failed: Token has expired');
          return false;
        }
      }

      console.debug('Token validation passed');
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  // Handle session update with validation
  const handleSessionUpdate = (currentSession: Session | null) => {
    console.debug('Session update handler:', { 
      hasSession: !!currentSession,
      userEmail: currentSession?.user?.email,
      accessToken: currentSession?.access_token ? '[PRESENT]' : '[MISSING]'
    });

    const isValid = validateToken(currentSession);
    console.debug('Session validation result:', { isValid });
    
    if (isValid) {
      console.debug('Setting valid session and user');
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    } else if (currentSession) {
      console.debug('Invalid session detected, attempting refresh');
      supabase.auth.refreshSession().then(({ data, error }) => {
        console.debug('Session refresh attempt result:', {
          success: !!data.session,
          error: error?.message,
          newTokenExpiry: data.session?.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : 'N/A'
        });
      });
    } else {
      console.debug('Clearing invalid session and user');
      setSession(null);
      setUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    console.debug('AuthProvider mounted, initializing auth state');

    // Get initial session with validation
    const getInitialSession = async () => {
      console.debug('Fetching initial session');
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        console.debug('Initial session fetch result:', { 
          hasSession: !!initialSession,
          userEmail: initialSession?.user?.email,
          error: error?.message,
          accessToken: initialSession?.access_token ? '[PRESENT]' : '[MISSING]',
          expiresAt: initialSession?.expires_at ? new Date(initialSession.expires_at * 1000).toISOString() : 'N/A'
        });
        
        if (mounted) {
          if (error) {
            console.error('Session fetch error:', error);
            toast.error('Error fetching session');
          }

          handleSessionUpdate(initialSession);
          
          console.debug('Delaying loading state update');
          setTimeout(() => {
            if (mounted) {
              console.debug('Setting loading to false');
              setLoading(false);
            }
          }, 100);
        }
      } catch (error) {
        console.error('Fatal error getting initial session:', error);
        if (mounted) {
          toast.error('Error initializing authentication');
          console.debug('Setting loading to false after error');
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes with validation
    console.debug('Setting up auth state change listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      console.debug('Auth state change detected:', { 
        event, 
        userEmail: currentSession?.user?.email,
        hasToken: !!currentSession?.access_token,
        tokenExpiry: currentSession?.expires_at ? new Date(currentSession.expires_at * 1000).toISOString() : 'N/A'
      });
      
      if (mounted) {
        handleSessionUpdate(currentSession);
      }
    });

    return () => {
      console.debug('AuthProvider unmounting, cleaning up');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    loading
  };

  // Debug logging
  console.debug('AuthProvider render state:', { 
    userEmail: user?.email,
    loading,
    hasSession: !!session,
    hasValidToken: session ? validateToken(session) : false,
    pathname: window.location.pathname,
    sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'
  });

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
