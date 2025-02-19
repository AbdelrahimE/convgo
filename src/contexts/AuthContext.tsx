
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
    if (!currentSession) return false;

    try {
      const { access_token, expires_at } = currentSession;
      
      // Check if token exists and has correct format
      if (!access_token || typeof access_token !== 'string') {
        console.error('Invalid token format');
        return false;
      }

      // Check token expiration
      if (expires_at) {
        const expirationTime = new Date(expires_at * 1000);
        if (expirationTime <= new Date()) {
          console.error('Token has expired');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  // Handle session update with validation
  const handleSessionUpdate = (currentSession: Session | null) => {
    const isValid = validateToken(currentSession);
    
    if (isValid) {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    } else if (currentSession) {
      // If session exists but is invalid, attempt refresh
      console.log('Attempting to refresh invalid session');
      supabase.auth.refreshSession();
    } else {
      // Clear session if no valid session exists
      setSession(null);
      setUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session with validation
    const getInitialSession = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        console.log('Initial session fetch attempt:', { 
          hasSession: !!initialSession,
          userEmail: initialSession?.user?.email,
          error: error?.message
        });
        
        if (mounted) {
          if (error) {
            console.error('Session fetch error:', error);
            toast.error('Error fetching session');
          }

          handleSessionUpdate(initialSession);
          
          // Delay setting loading to false to ensure state updates have propagated
          setTimeout(() => {
            if (mounted) {
              setLoading(false);
            }
          }, 100);
        }
      } catch (error) {
        console.error('Fatal error getting initial session:', error);
        if (mounted) {
          toast.error('Error initializing authentication');
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes with validation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      console.log('Auth state changed:', { 
        event, 
        userEmail: currentSession?.user?.email,
        hasToken: !!currentSession?.access_token
      });
      
      if (mounted) {
        handleSessionUpdate(currentSession);
      }
    });

    // Cleanup subscription and mounted flag
    return () => {
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
  console.log('AuthProvider state:', { 
    userEmail: user?.email,
    loading,
    hasSession: !!session,
    hasValidToken: session ? validateToken(session) : false,
    pathname: window.location.pathname
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
