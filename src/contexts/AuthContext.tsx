
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

// Combined state interface for coordinated updates
interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const initialState: AuthState = {
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
};

// Auth timeout duration (10 seconds)
const AUTH_TIMEOUT = 10000;

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  logout: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);

  // Enhanced admin check with better error handling
  const checkAdminStatus = async () => {
    console.debug('[Auth] Checking admin status');
    try {
      const { data, error } = await supabase.rpc('has_role', {
        role: 'admin'
      });
      
      if (error) {
        console.error('[Auth] Error checking admin status:', error);
        return false;
      }
      
      console.debug('[Auth] Admin status result:', !!data);
      return !!data;
    } catch (error) {
      console.error('[Auth] Unexpected error checking admin status:', error);
      return false;
    }
  };

  // Coordinated state update with timeout
  const updateAuthState = async (session: Session | null) => {
    console.debug('[Auth] Updating auth state:', { hasSession: !!session });

    const updatePromise = async () => {
      if (!session?.user) {
        console.debug('[Auth] No session/user, resetting state');
        setState({
          session: null,
          user: null,
          isAdmin: false,
          loading: false,
        });
        return;
      }

      const isAdminUser = await checkAdminStatus();
      
      console.debug('[Auth] Setting new state:', {
        hasSession: !!session,
        hasUser: !!session.user,
        isAdmin: isAdminUser,
      });

      setState({
        session,
        user: session.user,
        isAdmin: isAdminUser,
        loading: false,
      });
    };

    try {
      // Race between update and timeout
      await Promise.race([
        updatePromise(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth state update timed out')), AUTH_TIMEOUT)
        ),
      ]);
    } catch (error) {
      console.error('[Auth] Error updating auth state:', error);
      setState({ ...initialState, loading: false });
      toast.error("Authentication update failed. Please refresh the page.");
    }
  };

  // Enhanced logout with better error handling
  const logout = async () => {
    console.debug('[Auth] Initiating logout');
    try {
      await supabase.auth.signOut();
      setState(initialState);
      toast.success("Logged out successfully");
      console.debug('[Auth] Logout successful');
    } catch (error) {
      console.error('[Auth] Error during logout:', error);
      toast.error("Failed to log out. Please try again.");
    }
  };

  useEffect(() => {
    let mounted = true;
    console.debug('[Auth] Provider mounted');
    
    const initializeAuth = async () => {
      try {
        console.debug('[Auth] Initializing auth state');
        const initPromise = async () => {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) throw error;
          if (!mounted) return;
          
          console.debug('[Auth] Initial session retrieved:', { hasSession: !!session });
          await updateAuthState(session);
        };

        await Promise.race([
          initPromise(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initial auth check timed out')), AUTH_TIMEOUT)
          ),
        ]);
      } catch (error) {
        console.error('[Auth] Error during initialization:', error);
        if (mounted) {
          setState({ ...initialState, loading: false });
          toast.error(
            error.message.includes('timed out')
              ? "Authentication check timed out. Please refresh the page."
              : "Failed to initialize authentication. Please refresh the page."
          );
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] Auth state changed:', { event, hasSession: !!session });
      
      if (!mounted) {
        console.debug('[Auth] Skipping update - component unmounted');
        return;
      }
      
      await updateAuthState(session);
    });

    return () => {
      console.debug('[Auth] Provider unmounting - cleaning up');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session: state.session,
    user: state.user,
    loading: state.loading,
    isAdmin: state.isAdmin,
    logout
  };

  console.debug('[Auth] Provider rendering with:', {
    hasSession: !!value.session,
    hasUser: !!value.user,
    loading: value.loading,
    isAdmin: value.isAdmin
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
