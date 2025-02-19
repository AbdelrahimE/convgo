
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import FileManagement from '@/pages/FileManagement';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';
import WhatsAppLink from '@/pages/WhatsAppLink';
import './App.css';

function AppContent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!isAuthPage && <AppSidebar />}
        <main className="flex-1 px-4 py-8 overflow-auto">
          <Routes>
            {/* Auth route - not protected */}
            <Route path="/auth" element={<Auth />} />

            {/* Protected routes */}
            <Route
              path="/dashboard"
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

            {/* Redirect root to dashboard */}
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
          </Routes>
        </main>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
