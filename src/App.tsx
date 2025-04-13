
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import FileManagement from '@/pages/FileManagement';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import WhatsAppFileConfig from '@/pages/WhatsAppFileConfig';
import WhatsAppAIConfig from '@/pages/WhatsAppAIConfig';
import WhatsAppSupportConfig from '@/pages/WhatsAppSupportConfig';
import WebhookMonitor from '@/pages/WebhookMonitor';
import AccountSettings from '@/pages/AccountSettings';
import AIUsageMonitoring from '@/pages/AIUsageMonitoring';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';
import { AlignJustify } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { LogoWithText } from '@/components/Logo';
import './App.css';

function AppContent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full overflow-hidden">
        {!isAuthPage && <AppSidebar />}
        <main className="flex-1 overflow-auto relative w-full">
          {!isAuthPage && isMobile && (
           <div className="p-4 md:hidden flex items-center">
             <div className="flex items-center gap-2">
               <SidebarTrigger className="h-11 w-11 flex items-center justify-center">
                 <AlignJustify className="h-12 w-12" />
               </SidebarTrigger>
               <LogoWithText className="h-8" />
             </div>
           </div>
          )}
          <div className="px-4 py-4 md:py-8">
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
                    path="/whatsapp-file-config"
                    element={
                      <ProtectedRoute>
                        <WhatsAppFileConfig />
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
    </SidebarProvider>
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
