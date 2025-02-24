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
  timestamp: number;
  state: Omit<AuthState, 'loading'>;
  adminCheckTimestamp?: number;
}

interface AuthError {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
}

const initialState: AuthState = {
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
};

const AUTH_TIMEOUT = 20000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const ADMIN_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
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
  const stateRecoveryAttempted = useRef(false);
  const lastAdminCheck = useRef<number>(0);

  const formatError = (error: any): AuthError => {
    const now = new Date().toISOString();
    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: error.stack,
        timestamp: now,
      };
    }
    
    if (typeof error === 'string') {
      return {
        code: 'STRING_ERROR',
        message: error,
        timestamp: now,
      };
    }

    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: error.details || error.stack,
      timestamp: now,
    };
  };

  const handleError = (error: any, context: string, critical = false) => {
    const formattedError = formatError(error);
    console.error(`[Auth] Error in ${context}:`, formattedError);

    if (!mountedRef.current) return;

    if (critical) {
      toast.error(formattedError.message, {
        description: "Please try refreshing the page or contact support if the issue persists.",
        duration: 5000,
      });
    } else {
      toast.error(formattedError.message);
    }

    return formattedError;
  };

  const persistState = useCallback((newState: AuthState, adminCheckTime?: number) => {
    if (!newState.session) {
      localStorage.removeItem(STATE_STORAGE_KEY);
      return;
    }

    const persistedData: PersistedAuthState = {
      timestamp: Date.now(),
      state: {
        session: newState.session,
        user: newState.user,
        isAdmin: newState.isAdmin,
      },
      adminCheckTimestamp: adminCheckTime || lastAdminCheck.current,
    };

    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(persistedData));
    } catch (error) {
      console.warn('[Auth] Failed to persist state:', error);
    }
  }, []);

  const recoverState = useCallback((): { state: Partial<AuthState>, adminCheckTimestamp?: number } | null => {
    try {
      const stored = localStorage.getItem(STATE_STORAGE_KEY);
      if (!stored) return null;

      const parsed: PersistedAuthState = JSON.parse(stored);
      
      if (Date.now() - parsed.timestamp > STATE_MAX_AGE) {
        localStorage.removeItem(STATE_STORAGE_KEY);
        return null;
      }

      return {
        state: parsed.state,
        adminCheckTimestamp: parsed.adminCheckTimestamp
      };
    } catch (error) {
      console.warn('[Auth] Failed to recover state:', error);
      localStorage.removeItem(STATE_STORAGE_KEY);
      return null;
    }
  }, []);

  const cleanupOnUnmount = () => {
    pendingPromises.current.forEach(controller => controller.abort());
    pendingPromises.current = [];
  };

  const checkAdminStatus = useCallback(async (retryCount = 0, force = false): Promise<boolean> => {
    const now = Date.now();
    
    if (!force && lastAdminCheck.current && (now - lastAdminCheck.current < ADMIN_CACHE_DURATION)) {
      console.debug('[Auth] Using cached admin status');
      return state.isAdmin;
    }

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
        handleError(error, 'admin status check');
        if (retryCount < MAX_RETRIES) {
          console.debug(`[Auth] Retrying admin check in ${RETRY_DELAY}ms`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return checkAdminStatus(retryCount + 1);
        }
        return false;
      }
      
      lastAdminCheck.current = now;
      console.debug('[Auth] Admin status result:', !!data);
      return !!data;
    } catch (error) {
      handleError(error, 'admin status check');
      return false;
    }
  }, [state.isAdmin]);

  const updateAuthState = useCallback(async (session: Session | null, retryCount = 0) => {
    console.debug('[Auth] Updating auth state:', { 
      hasSession: !!session, 
      attempt: retryCount + 1,
      isRecoveredState: !!recoverState()
    });

    const updatePromise = async () => {
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

      const recovered = recoverState();
      let isAdminUser = false;

      if (recovered?.state && 
          'isAdmin' in recovered.state && 
          recovered.adminCheckTimestamp && 
          (Date.now() - recovered.adminCheckTimestamp < ADMIN_CACHE_DURATION) &&
          !stateRecoveryAttempted.current) {
        console.debug('[Auth] Using recovered admin status');
        isAdminUser = recovered.state.isAdmin as boolean;
        lastAdminCheck.current = recovered.adminCheckTimestamp;
        stateRecoveryAttempted.current = true;
      } else {
        isAdminUser = await checkAdminStatus(0, true);
      }
      
      if (!mountedRef.current) return;

      const newState: AuthState = {
        session,
        user: session.user,
        isAdmin: isAdminUser,
        loading: false,
      };

      setState(prevState => {
        if (JSON.stringify(prevState) === JSON.stringify(newState)) {
          console.debug('[Auth] Skipping state update - no changes');
          return prevState;
        }
        console.debug('[Auth] Updating state with changes');
        return newState;
      });
      persistState(newState, Date.now());
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
      const formattedError = handleError(error, 'state update', true);
      
      const recoveredState = recoverState();
      if (recoveredState?.state && mountedRef.current && retryCount === MAX_RETRIES) {
        console.debug('[Auth] Recovering from persisted state');
        setState({ 
          session: recoveredState.state.session as Session,
          user: recoveredState.state.user as User,
          isAdmin: recoveredState.state.isAdmin as boolean,
          loading: false 
        });
        toast.info("Recovered from last known good state", {
          description: `Last verified: ${new Date((recoveredState.state.session as Session)?.expires_at || 0).toLocaleString()}`,
        });
        return;
      }

      if (retryCount < MAX_RETRIES && mountedRef.current) {
        console.debug(`[Auth] Retrying state update in ${RETRY_DELAY}ms`);
        toast.info(`Retrying... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return updateAuthState(session, retryCount + 1);
      }

      if (mountedRef.current) {
        setState(initialState);
        toast.error("Authentication failed", {
          description: formattedError.message,
          duration: 5000,
        });
      }
    }
  }, [persistState, recoverState, checkAdminStatus]);

  const logout = async () => {
    console.debug('[Auth] Initiating logout');
    try {
      cleanupOnUnmount();
      localStorage.removeItem(STATE_STORAGE_KEY);
      await supabase.auth.signOut();
      if (mountedRef.current) {
        setState(initialState);
        toast.success("Logged out successfully");
      }
      console.debug('[Auth] Logout successful');
    } catch (error) {
      handleError(error, 'logout');
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
          const recovered = recoverState();
          if (recovered?.state && !stateRecoveryAttempted.current) {
            console.debug('[Auth] Recovered state found:', recovered);
            setState({ 
              session: recovered.state.session,
              user: recovered.state.user,
              isAdmin: recovered.state.isAdmin,
              loading: false 
            });
            if (recovered.adminCheckTimestamp) {
              lastAdminCheck.current = recovered.adminCheckTimestamp;
            }
            stateRecoveryAttempted.current = true;
            toast.info("Restored previous session", {
              description: "Verifying authentication status...",
            });
          }

          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) throw error;
          if (!mountedRef.current) return;
          
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
        const formattedError = handleError(error, 'initialization', true);
        const recoveredState = recoverState();
        if (recoveredState && mountedRef.current) {
          console.debug('[Auth] Recovering from persisted state after init error');
          setState({ 
            session: recoveredState.state.session,
            user: recoveredState.state.user,
            isAdmin: recoveredState.state.isAdmin,
            loading: false 
          });
          toast.info("Using cached authentication state", {
            description: "Unable to verify current status. Some features may be limited.",
            duration: 5000,
          });
          return;
        }

        if (mountedRef.current) {
          setState({ ...initialState, loading: false });
          toast.error("Authentication initialization failed", {
            description: formattedError.message,
            duration: 5000,
          });
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
      
      if (event === 'SIGNED_OUT') {
        toast.info("You have been signed out");
        lastAdminCheck.current = 0; // Reset admin cache on logout
      } else if (event === 'SIGNED_IN') {
        toast.success("Signed in successfully");
      }
      
      await updateAuthState(session);
    });

    return () => {
      console.debug('[Auth] Provider unmounting - cleaning up');
      mountedRef.current = false;
      cleanupOnUnmount();
      subscription.unsubscribe();
    };
  }, [updateAuthState, recoverState]);

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
