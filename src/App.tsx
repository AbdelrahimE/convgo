
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import FileManagement from '@/pages/FileManagement';
import { SimpleSidebar, type SimpleSidebarHandle } from '@/components/SimpleSidebar';
import { Button } from '@/components/ui/button';
import { AlignJustify } from 'lucide-react';
import { LogoWithText } from '@/components/Logo';
import { useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import WhatsAppAIConfig from '@/pages/WhatsAppAIConfig';
import WhatsAppSupportConfig from '@/pages/WhatsAppSupportConfig';
import WebhookMonitor from '@/pages/WebhookMonitor';
import AccountSettings from '@/pages/AccountSettings';
import AIUsageMonitoring from '@/pages/AIUsageMonitoring';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';

import './App.css';

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
                    path="/files"
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
                    path="/whatsapp-support-config"
                    element={
                      <ProtectedRoute>
                        <WhatsAppSupportConfig />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/webhook-monitor"
                    element={
                      <ProtectedRoute>
                        <WebhookMonitor />
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
                </Routes>
              </NetworkErrorBoundary>
            </ErrorBoundary>
          </div>
        </main>
      </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NetworkErrorBoundary>
        <AuthProvider>
          <Router>
            <AppContent />
            <Toaster />
          </Router>
        </AuthProvider>
      </NetworkErrorBoundary>
    </ErrorBoundary>
  );
}

export default App;
