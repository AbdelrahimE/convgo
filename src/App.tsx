
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import Auth from '@/pages/Auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import FileManagement from '@/pages/FileManagement';
import { SimpleSidebar, type SimpleSidebarHandle } from '@/components/SimpleSidebar';
import { Button } from '@/components/ui/button';
import { PanelRight } from 'lucide-react';
import { LogoWithText } from '@/components/Logo';
import { useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import WhatsAppAIConfig from '@/pages/WhatsAppAIConfig';
import AccountSettings from '@/pages/AccountSettings';
import Dashboard from '@/pages/Dashboard';
import AIPersonalities from '@/pages/AIPersonalities';
import EscalationManagement from '@/pages/EscalationManagement';
import DataCollection from '@/pages/DataCollection';
import ExternalActions from '@/pages/ExternalActions';
import CreateExternalAction from '@/pages/external-actions/CreateExternalAction';
import EditExternalAction from '@/pages/external-actions/EditExternalAction';
import OAuthCallbackWrapper from '@/components/data-collection/OAuthCallbackWrapper';
import AuthCallback from '@/components/auth/AuthCallback';
import { CustomerProfiles } from '@/pages/CustomerProfiles';
import { CustomerProfileEdit } from '@/pages/CustomerProfileEdit';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';
import { SessionExpiryNotification } from '@/components/SessionExpiryNotification';
// Disabled languageDetector - now using unified i18n system for language management
// import { initLanguageDetection } from '@/utils/languageDetector';

import './App.css';

// Create QueryClient instance with optimized settings and global error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes - increased from 5 to reduce unnecessary refetches
      gcTime: 15 * 60 * 1000, // 15 minutes - increased from 10 (gcTime replaces cacheTime in newer versions)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Prevent automatic refetch on reconnect to reduce API calls

      // Smart retry logic - don't retry authentication errors
      retry: (failureCount, error: any) => {
        // Don't retry on authentication/authorization errors
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }

        // Don't retry on rate limit errors (429) - wait for rate limit to reset
        if (error?.status === 429) {
          return false;
        }

        // Don't retry on client errors (4xx) except specific ones
        if (error?.status >= 400 && error?.status < 500) {
          // Only retry on specific client errors like 408 (timeout)
          const retryableClientErrors = [408];
          if (!retryableClientErrors.includes(error?.status)) {
            return false;
          }
        }

        // Retry server errors (5xx) and network errors up to 2 times
        return failureCount < 2;
      },

      // Global error handler for all queries
      onError: (error: any) => {
        console.error('React Query Error:', error);

        // Handle authentication errors (expired or invalid JWT)
        if (error?.status === 401) {
          console.warn('Authentication error detected - JWT may be expired');
          // The AuthContext will handle session refresh automatically
          // If refresh fails, user will be redirected to /auth by ProtectedRoute
        }

        // Handle authorization errors (insufficient permissions)
        if (error?.status === 403) {
          console.warn('Authorization error detected - insufficient permissions');
        }
      },
    },
    mutations: {
      // Global error handler for all mutations
      onError: (error: any) => {
        console.error('React Query Mutation Error:', error);

        // Handle authentication errors in mutations
        if (error?.status === 401) {
          console.warn('Authentication error in mutation - JWT may be expired');
        }
      },
    },
  },
});

function AppContent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth' || location.pathname === '/auth/callback' || location.pathname === '/auth/reset-password' || location.search.includes('reset=true');
  const sidebarRef = useRef<SimpleSidebarHandle | null>(null);
  const isMobile = useIsMobile();

  return (
    <div className="h-screen flex w-full overflow-hidden">
      {!isAuthPage && <SimpleSidebar ref={sidebarRef} />}
      <main className={`flex-1 ${isAuthPage ? 'overflow-hidden' : 'overflow-auto'} relative w-full`}>
        {/* Session Expiry Notification - Only show on protected pages */}
        {/* autoRefresh is disabled to rely on centralized sessionManager and prevent concurrent refreshes */}
        {!isAuthPage && <SessionExpiryNotification warningMinutes={15} autoRefresh={false} />}

        {!isAuthPage && isMobile && (
          <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => sidebarRef.current?.open()}
              >
                <PanelRight className="h-8 w-8" />
              </Button>
              <LogoWithText className="h-8" />
            </div>
          </div>
        )}
        <div className={isAuthPage ? "" : "px-2 py-2 md:py-4"}>
            <ErrorBoundary>
              <NetworkErrorBoundary>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/auth/reset-password" element={<Auth isResetPasswordMode />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Navigate to="/dashboard" replace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/knowledge-base"
                    element={
                      <ProtectedRoute>
                        <FileManagement />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/whatsapp"
                    element={
                      <ProtectedRoute>
                        <WhatsAppLink />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/whatsapp-ai-config"
                    element={
                      <ProtectedRoute>
                        <WhatsAppAIConfig />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ai-personalities"
                    element={
                      <ProtectedRoute>
                        <AIPersonalities />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account-settings"
                    element={
                      <ProtectedRoute>
                        <AccountSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/escalation-management"
                    element={
                      <ProtectedRoute>
                        <EscalationManagement />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/data-collection"
                    element={
                      <ProtectedRoute>
                        <DataCollection />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer-profiles"
                    element={
                      <ProtectedRoute>
                        <CustomerProfiles />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer-profiles/edit/:instanceId/:phoneNumber"
                    element={
                      <ProtectedRoute>
                        <CustomerProfileEdit />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/external-actions"
                    element={
                      <ProtectedRoute>
                        <ExternalActions />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/external-actions/create"
                    element={
                      <ProtectedRoute>
                        <CreateExternalAction />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/external-actions/edit/:id"
                    element={
                      <ProtectedRoute>
                        <EditExternalAction />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/data-collection/callback"
                    element={
                      <ProtectedRoute>
                        <OAuthCallbackWrapper />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </NetworkErrorBoundary>
            </ErrorBoundary>
          </div>
        </main>
      </div>
  );
}

function App() {
  // Disabled languageDetector - now using unified i18n system for language management
  // Language direction and fonts are now managed by i18n system in src/i18n/index.ts
  // CSS targets html[lang] attribute set by i18n, no need for per-element detection
  /*
  useEffect(() => {
    // Initialize simple language detection
    const observer = initLanguageDetection();

    return () => observer.disconnect();
  }, []);
  */

  return (
    <ErrorBoundary>
      <NetworkErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <Router>
                <AppContent />
                <Toaster />
              </Router>
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </NetworkErrorBoundary>
    </ErrorBoundary>
  );
}

export default App;
