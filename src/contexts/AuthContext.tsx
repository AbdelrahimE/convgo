
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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

interface PersistedAuthState {
  state: {
    session: Session | null;
    user: User | null;
    isAdmin: boolean;
  };
}

const initialState: AuthState = {
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
};

const AUTH_TIMEOUT = 5000; // Reduced from 20000 to 5000
const MAX_RETRIES = 1;    // Reduced from 3 to 1
const STATE_STORAGE_KEY = 'auth_state';
const STATE_MAX_AGE = 1000 * 60 * 60;

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

  const formatError = (error: any) => {
    const now = new Date().toISOString();
    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        timestamp: now,
      };
    }
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: now,
    };
  };

  const handleError = (error: any, context: string, critical = false) => {
    const formattedError = formatError(error);
    console.error(`[Auth] Error in ${context}:`, formattedError);

    if (!mountedRef.current) return;

    if (critical) {
      toast.error("Authentication error", {
        description: formattedError.message,
      });
    }

    return formattedError;
  };

  const persistState = useCallback((newState: AuthState) => {
    console.debug('[Auth] Persisting state:', {
      hasSession: !!newState.session,
      hasUser: !!newState.user,
      isAdmin: newState.isAdmin
    });

    if (!newState.session) {
      console.debug('[Auth] No session, clearing persisted state');
      localStorage.removeItem(STATE_STORAGE_KEY);
      return;
    }

    const persistedData: PersistedAuthState = {
      state: {
        session: newState.session,
        user: newState.user,
        isAdmin: newState.isAdmin,
      },
    };

    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(persistedData));
      console.debug('[Auth] State persisted successfully');
    } catch (error) {
      console.warn('[Auth] Failed to persist state:', error);
    }
  }, []);

  const recoverState = useCallback((): PersistedAuthState | null => {
    console.debug('[Auth] Attempting to recover state from storage');
    try {
      const stored = localStorage.getItem(STATE_STORAGE_KEY);
      if (!stored) {
        console.debug('[Auth] No stored state found');
        return null;
      }

      const recovered = JSON.parse(stored);
      console.debug('[Auth] Recovered state:', {
        hasSession: !!recovered?.state?.session,
        hasUser: !!recovered?.state?.user,
        isAdmin: recovered?.state?.isAdmin
      });
      return recovered;
    } catch (error) {
      console.warn('[Auth] Failed to recover state:', error);
      localStorage.removeItem(STATE_STORAGE_KEY);
      return null;
    }
  }, []);

  const checkAdminStatus = useCallback(async (): Promise<boolean> => {
    try {
      console.debug('[Auth] Checking admin status');
      const { data, error } = await supabase.rpc('has_role', {
        role: 'admin'
      });

      if (error) {
        console.warn('[Auth] Admin check failed:', error);
        return false;
      }

      console.debug('[Auth] Admin status result:', data);
      return !!data;
    } catch (error) {
      console.warn('[Auth] Admin check error:', error);
      return false;
    }
  }, []);

  const updateAuthState = useCallback(async (session: Session | null, retryCount = 0) => {
    console.debug('[Auth] Updating auth state:', { 
      hasSession: !!session,
      sessionUser: session?.user?.email,
      retryCount
    });

    if (!session?.user) {
      console.debug('[Auth] No session/user, resetting state');
      const newState: AuthState = {
        session: null,
        user: null,
        isAdmin: false,
        loading: false,
      };
      setState(newState);
      persistState(newState);
      return;
    }

    try {
      console.debug('[Auth] Checking admin status for user:', session.user.email);
      const isAdminUser = await checkAdminStatus();
      
      if (!mountedRef.current) {
        console.debug('[Auth] Component unmounted during admin check');
        return;
      }

      const newState: AuthState = {
        session,
        user: session.user,
        isAdmin: isAdminUser,
        loading: false,
      };

      console.debug('[Auth] Setting new state:', {
        userEmail: session.user.email,
        isAdmin: isAdminUser,
        loading: false
      });

      setState(newState);
      persistState(newState);
    } catch (error) {
      const formattedError = handleError(error, 'state update');

      if (retryCount < MAX_RETRIES && mountedRef.current) {
        console.debug('[Auth] Retrying state update, attempt:', retryCount + 1);
        await updateAuthState(session, retryCount + 1);
        return;
      }

      console.debug('[Auth] Max retries reached or proceeding with non-admin access');
      const newState: AuthState = {
        session,
        user: session.user,
        isAdmin: false,
        loading: false,
      };
      
      setState(newState);
      persistState(newState);
    }
  }, [persistState, checkAdminStatus]);

  const logout = async () => {
    console.debug('[Auth] Initiating logout');
    try {
      localStorage.removeItem(STATE_STORAGE_KEY);
      await supabase.auth.signOut();
      console.debug('[Auth] Logout successful');
      setState(initialState);
      toast.success("Logged out successfully");
    } catch (error) {
      handleError(error, 'logout');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    console.debug('[Auth] Provider mounted, initializing auth');
    
    const initializeAuth = async () => {
      console.debug('[Auth] Starting initialization');
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        console.debug('[Auth] Got session:', { 
          hasSession: !!session,
          sessionUser: session?.user?.email,
          error: error?.message 
        });
        
        if (error) throw error;
        if (!mountedRef.current) {
          console.debug('[Auth] Component unmounted during initialization');
          return;
        }
        
        await updateAuthState(session);
      } catch (error) {
        handleError(error, 'initialization', true);
        setState({ ...initialState, loading: false });
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] Auth state changed:', { 
        event, 
        hasSession: !!session,
        sessionUser: session?.user?.email 
      });
      
      if (!mountedRef.current) {
        console.debug('[Auth] Component unmounted during auth state change');
        return;
      }
      
      if (event === 'SIGNED_OUT') {
        console.debug('[Auth] User signed out');
        toast.info("You have been signed out");
      } else if (event === 'SIGNED_IN') {
        console.debug('[Auth] User signed in:', session?.user?.email);
        toast.success("Signed in successfully");
      }
      
      await updateAuthState(session);
    });

    return () => {
      console.debug('[Auth] Provider unmounting');
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [updateAuthState]);

  return (
    <AuthContext.Provider value={{
      session: state.session,
      user: state.user,
      loading: state.loading,
      isAdmin: state.isAdmin,
      logout
    }}>
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
