
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
import { AlignJustify } from 'lucide-react';
import { LogoWithText } from '@/components/Logo';
import { useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import WhatsAppAIConfig from '@/pages/WhatsAppAIConfig';
import AccountSettings from '@/pages/AccountSettings';
import AIUsageMonitoring from '@/pages/AIUsageMonitoring';
import AIPersonalities from '@/pages/AIPersonalities';
import EscalationManagement from '@/pages/EscalationManagement';
import DataCollection from '@/pages/DataCollection';
import ExternalActions from '@/pages/ExternalActions';
import CreateExternalAction from '@/pages/external-actions/CreateExternalAction';
import EditExternalAction from '@/pages/external-actions/EditExternalAction';
import OAuthCallbackWrapper from '@/components/data-collection/OAuthCallbackWrapper';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';
import { initLanguageDetection } from '@/utils/languageDetector';

import './App.css';

// Create QueryClient instance with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppContent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth' || location.search.includes('reset=true');
  const sidebarRef = useRef<SimpleSidebarHandle | null>(null);
  const isMobile = useIsMobile();

  return (
    <div className="h-screen flex w-full overflow-hidden">
      {!isAuthPage && <SimpleSidebar ref={sidebarRef} />}
      <main className="flex-1 overflow-auto relative w-full">
        {!isAuthPage && isMobile && (
          <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => sidebarRef.current?.open()}
              >
                <AlignJustify className="h-6 w-6" />
              </Button>
              <LogoWithText className="h-6" />
            </div>
          </div>
        )}
        <div className="px-2 py-2 md:py-4">
            <ErrorBoundary>
              <NetworkErrorBoundary>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Navigate to="/whatsapp" replace />
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
                    path="/ai-usage"
                    element={
                      <ProtectedRoute>
                        <AIUsageMonitoring />
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
  useEffect(() => {
    // Initialize simple language detection
    const observer = initLanguageDetection();
    
    return () => observer.disconnect();
  }, []);

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
