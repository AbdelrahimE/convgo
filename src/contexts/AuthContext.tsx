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

interface PersistedAuthState {
  timestamp: number;
  state: Omit<AuthState, 'loading'>;
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

  const persistState = (newState: AuthState) => {
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
    };

    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(persistedData));
    } catch (error) {
      console.warn('[Auth] Failed to persist state:', error);
    }
  };

  const recoverState = (): Partial<AuthState> | null => {
    try {
      const stored = localStorage.getItem(STATE_STORAGE_KEY);
      if (!stored) return null;

      const { timestamp, state: storedState }: PersistedAuthState = JSON.parse(stored);
      
      if (Date.now() - timestamp > STATE_MAX_AGE) {
        localStorage.removeItem(STATE_STORAGE_KEY);
        return null;
      }

      return storedState;
    } catch (error) {
      console.warn('[Auth] Failed to recover state:', error);
      localStorage.removeItem(STATE_STORAGE_KEY);
      return null;
    }
  };

  const cleanupOnUnmount = () => {
    pendingPromises.current.forEach(controller => controller.abort());
    pendingPromises.current = [];
  };

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

  const updateAuthState = async (session: Session | null, retryCount = 0) => {
    console.debug('[Auth] Updating auth state:', { 
      hasSession: !!session, 
      attempt: retryCount + 1,
      isRecoveredState: !!recoverState()
    });

    const updatePromise = async () => {
      if (!session?.user) {
        console.debug('[Auth] No session/user, resetting state');
        const newState = {
          session: null,
          user: null,
          isAdmin: false,
          loading: false,
        };
        setState(newState);
        persistState(newState);
        return;
      }

      const recoveredState = recoverState();
      let isAdminUser = false;

      if (recoveredState?.isAdmin !== undefined && !stateRecoveryAttempted.current) {
        console.debug('[Auth] Using recovered admin status');
        isAdminUser = recoveredState.isAdmin;
        stateRecoveryAttempted.current = true;
      } else {
        isAdminUser = await checkAdminStatus();
      }
      
      if (!mountedRef.current) return;

      const newState = {
        session,
        user: session.user,
        isAdmin: isAdminUser,
        loading: false,
      };

      console.debug('[Auth] Setting new state:', {
        hasSession: !!session,
        hasUser: !!session.user,
        isAdmin: isAdminUser,
        isRecovered: !!recoveredState
      });

      setState(newState);
      persistState(newState);
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
      
      const recoveredState = recoverState();
      if (recoveredState && mountedRef.current && retryCount === MAX_RETRIES) {
        console.debug('[Auth] Recovering from persisted state');
        setState({ ...recoveredState, loading: false });
        return;
      }

      if (retryCount < MAX_RETRIES && mountedRef.current) {
        console.debug(`[Auth] Retrying state update in ${RETRY_DELAY}ms`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return updateAuthState(session, retryCount + 1);
      }

      if (mountedRef.current) {
        const newState = { ...initialState, loading: false };
        setState(newState);
        persistState(newState);
        toast.error("Authentication update failed. Please refresh the page.");
      }
    }
  };

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
          const recoveredState = recoverState();
          if (recoveredState && !stateRecoveryAttempted.current) {
            console.debug('[Auth] Recovered state found:', recoveredState);
            setState({ ...recoveredState, loading: false });
            stateRecoveryAttempted.current = true;
          }

          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) throw error;
          if (!mountedRef.current) return;
          
          console.debug('[Auth] Initial session retrieved:', { 
            hasSession: !!session,
            hasRecoveredState: !!recoveredState 
          });
          
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
        const recoveredState = recoverState();
        if (recoveredState && mountedRef.current) {
          console.debug('[Auth] Recovering from persisted state after init error');
          setState({ ...recoveredState, loading: false });
          return;
        }

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
