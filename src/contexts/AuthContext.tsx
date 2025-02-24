
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

// Timeout duration in milliseconds
const AUTH_TIMEOUT_DURATION = 10000; // 10 seconds

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  logout: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>(initialState);

  // Check if user is admin using the updated RPC function
  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        role: 'admin'
      });
      
      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
      
      return !!data;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  };

  // Coordinated state update function with timeout
  const updateAuthState = async (session: Session | null) => {
    console.log('Updating auth state with session:', session);
    
    // Create a promise that resolves after the timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Auth state update timed out'));
      }, AUTH_TIMEOUT_DURATION);
    });

    try {
      // Race between the actual update and the timeout
      await Promise.race([
        (async () => {
          if (!session?.user) {
            setAuthState({
              session: null,
              user: null,
              isAdmin: false,
              loading: false,
            });
            return;
          }

          const isAdminUser = await checkAdminStatus();
          
          setAuthState({
            session,
            user: session.user,
            isAdmin: isAdminUser,
            loading: false,
          });
        })(),
        timeoutPromise
      ]);
    } catch (error) {
      console.error('Auth state update error:', error);
      // If timeout or error occurs, reset to a safe state
      setAuthState({
        ...initialState,
        loading: false,
      });
      toast.error("Authentication timed out. Please try refreshing the page.");
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setAuthState(initialState);
      toast.success("Logged out successfully");
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error("Failed to log out");
    }
  };

  useEffect(() => {
    let mounted = true;
    console.log('AuthProvider mounted');
    
    // Get initial session with timeout
    const initializeAuth = async () => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Initial auth check timed out'));
        }, AUTH_TIMEOUT_DURATION);
      });

      try {
        // Race between the session check and timeout
        await Promise.race([
          (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            console.log('Initial session:', session);
            
            if (!mounted) return;
            
            await updateAuthState(session);
          })(),
          timeoutPromise
        ]);
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setAuthState({
            ...initialState,
            loading: false,
          });
          if (error.message.includes('timed out')) {
            toast.error("Authentication check timed out. Please refresh the page.");
          }
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', session);
      
      if (!mounted) return;
      
      await updateAuthState(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session: authState.session,
    user: authState.user,
    loading: authState.loading,
    isAdmin: authState.isAdmin,
    logout
  };

  console.log('AuthProvider rendering with:', value);

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
