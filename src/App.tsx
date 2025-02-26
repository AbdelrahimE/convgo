
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

// Pages
import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import FileManagement from "@/pages/FileManagement";
import MetadataManagement from "@/pages/MetadataManagement";
import WhatsAppLink from "@/pages/WhatsAppLink";
import Dashboard from "@/pages/Dashboard";

// Components
import { NetworkErrorBoundary } from "@/components/NetworkErrorBoundary";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import TestOpenAIConnection from "@/components/TestOpenAIConnection";

import "./App.css";

function App() {
  return (
    <Router>
      <AuthProvider>
        <NetworkErrorBoundary>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />}>
                <Route index element={<TestOpenAIConnection />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="files" element={<FileManagement />} />
                <Route path="metadata" element={<MetadataManagement />} />
                <Route path="whatsapp" element={<WhatsAppLink />} />
              </Route>
              <Route path="/auth" element={<Auth />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </NetworkErrorBoundary>
        <Toaster />
        <SonnerToaster />
      </AuthProvider>
    </Router>
  );
}

export default App;
