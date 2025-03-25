
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import FileManagement from '@/pages/FileManagement';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import WhatsAppFileConfig from '@/pages/WhatsAppFileConfig';
import WhatsAppAIConfig from '@/pages/WhatsAppAIConfig';
import WebhookMonitor from '@/pages/WebhookMonitor';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './App.css';

// Create a client
const queryClient = new QueryClient();

function AppContent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!isAuthPage && <AppSidebar />}
        <main className="flex-1 px-4 py-8 overflow-auto">
          <ErrorBoundary>
            <NetworkErrorBoundary>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <div>Dashboard (coming soon)</div>
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
                  path="/webhook-monitor"
                  element={
                    <ProtectedRoute>
                      <WebhookMonitor />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </NetworkErrorBoundary>
          </ErrorBoundary>
        </main>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NetworkErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Router>
              <AppContent />
              <Toaster />
            </Router>
          </AuthProvider>
        </QueryClientProvider>
      </NetworkErrorBoundary>
    </ErrorBoundary>
  );
}

export default App;
