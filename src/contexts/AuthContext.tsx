
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

// Increased timeout and added retry configuration
const AUTH_TIMEOUT = 20000; // Increased to 20 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds between retries

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  logout: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);
  const mountedRef = useRef(true);
  const pendingPromises = useRef<AbortController[]>([]);

  // Utility to handle unmounting and cleanup
  const cleanupOnUnmount = () => {
    pendingPromises.current.forEach(controller => controller.abort());
    pendingPromises.current = [];
  };

  // Enhanced admin check with retry mechanism
  const checkAdminStatus = async (retryCount = 0): Promise<boolean> => {
    console.debug('[Auth] Checking admin status (attempt ' + (retryCount + 1) + ')');
    try {
      const controller = new AbortController();
      pendingPromises.current.push(controller);

      const { data, error } = await supabase.rpc('has_role', {
        role: 'admin'
      });

      const index = pendingPromises.current.indexOf(controller);
      if (index > -1) pendingPromises.current.splice(index, 1);
      
      if (error) {
        console.error('[Auth] Error checking admin status:', error);
        if (retryCount < MAX_RETRIES) {
          console.debug(`[Auth] Retrying admin check in ${RETRY_DELAY}ms`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return checkAdminStatus(retryCount + 1);
        }
        return false;
      }
      
      console.debug('[Auth] Admin status result:', !!data);
      return !!data;
    } catch (error) {
      console.error('[Auth] Unexpected error checking admin status:', error);
      return false;
    }
  };

  // Improved state update with retry mechanism
  const updateAuthState = async (session: Session | null, retryCount = 0) => {
    console.debug('[Auth] Updating auth state:', { hasSession: !!session, attempt: retryCount + 1 });

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
      
      if (!mountedRef.current) return;

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
      const controller = new AbortController();
      pendingPromises.current.push(controller);

      await Promise.race([
        updatePromise(),
        new Promise((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Auth state update timed out'));
          }, AUTH_TIMEOUT);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
          });
        }),
      ]);

      const index = pendingPromises.current.indexOf(controller);
      if (index > -1) pendingPromises.current.splice(index, 1);
    } catch (error) {
      console.error('[Auth] Error updating auth state:', error);
      if (retryCount < MAX_RETRIES && mountedRef.current) {
        console.debug(`[Auth] Retrying state update in ${RETRY_DELAY}ms`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return updateAuthState(session, retryCount + 1);
      }
      if (mountedRef.current) {
        setState({ ...initialState, loading: false });
        toast.error("Authentication update failed. Please refresh the page.");
      }
    }
  };

  const logout = async () => {
    console.debug('[Auth] Initiating logout');
    try {
      cleanupOnUnmount(); // Cancel any pending operations
      await supabase.auth.signOut();
      if (mountedRef.current) {
        setState(initialState);
        toast.success("Logged out successfully");
      }
      console.debug('[Auth] Logout successful');
    } catch (error) {
      console.error('[Auth] Error during logout:', error);
      if (mountedRef.current) {
        toast.error("Failed to log out. Please try again.");
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    console.debug('[Auth] Provider mounted');
    
    const initializeAuth = async () => {
      try {
        console.debug('[Auth] Initializing auth state');
        const controller = new AbortController();
        pendingPromises.current.push(controller);

        const initPromise = async () => {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) throw error;
          if (!mountedRef.current) return;
          
          console.debug('[Auth] Initial session retrieved:', { hasSession: !!session });
          await updateAuthState(session);
        };

        await Promise.race([
          initPromise(),
          new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Initial auth check timed out'));
            }, AUTH_TIMEOUT);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
            });
          }),
        ]);

        const index = pendingPromises.current.indexOf(controller);
        if (index > -1) pendingPromises.current.splice(index, 1);
      } catch (error) {
        console.error('[Auth] Error during initialization:', error);
        if (mountedRef.current) {
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
      
      if (!mountedRef.current) {
        console.debug('[Auth] Skipping update - component unmounted');
        return;
      }
      
      await updateAuthState(session);
    });

    return () => {
      console.debug('[Auth] Provider unmounting - cleaning up');
      mountedRef.current = false;
      cleanupOnUnmount();
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
