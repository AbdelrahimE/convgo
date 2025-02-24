
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
    if (!newState.session) {
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
    } catch (error) {
      console.warn('[Auth] Failed to persist state:', error);
    }
  }, []);

  const recoverState = useCallback((): PersistedAuthState | null => {
    try {
      const stored = localStorage.getItem(STATE_STORAGE_KEY);
      if (!stored) return null;

      return JSON.parse(stored);
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

      return !!data;
    } catch (error) {
      console.warn('[Auth] Admin check error:', error);
      return false;
    }
  }, []);

  const updateAuthState = useCallback(async (session: Session | null, retryCount = 0) => {
    console.debug('[Auth] Updating auth state:', { hasSession: !!session });

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
      const isAdminUser = await checkAdminStatus();
      
      if (!mountedRef.current) return;

      const newState: AuthState = {
        session,
        user: session.user,
        isAdmin: isAdminUser,
        loading: false,
      };

      setState(newState);
      persistState(newState);
    } catch (error) {
      const formattedError = handleError(error, 'state update');

      if (retryCount < MAX_RETRIES && mountedRef.current) {
        console.debug('[Auth] Retrying state update');
        await updateAuthState(session, retryCount + 1);
        return;
      }

      // If we can't verify admin status, proceed with non-admin access
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
      setState(initialState);
      toast.success("Logged out successfully");
    } catch (error) {
      handleError(error, 'logout');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    console.debug('[Auth] Provider mounted');
    
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mountedRef.current) return;
        
        await updateAuthState(session);
      } catch (error) {
        handleError(error, 'initialization', true);
        setState({ ...initialState, loading: false });
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] Auth state changed:', { event, hasSession: !!session });
      
      if (!mountedRef.current) return;
      
      if (event === 'SIGNED_OUT') {
        toast.info("You have been signed out");
      } else if (event === 'SIGNED_IN') {
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
