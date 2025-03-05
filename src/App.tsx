
import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './App.css'

import WhatsAppLink from './pages/WhatsAppLink'
import TextProcessingDemo from './pages/TextProcessingDemo'
import OpenAITest from './pages/OpenAITest'
import FileManagement from './pages/FileManagement'
import MetadataManagement from './pages/MetadataManagement'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import SemanticSearchTest from './pages/SemanticSearchTest'

// Auth components
import { AuthProvider } from './contexts/AuthContext'
import Auth from './pages/Auth'
import ProtectedRoute from './components/ProtectedRoute'
import NetworkErrorBoundary from './components/NetworkErrorBoundary'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  return (
    <Router>
      <TooltipProvider>
        <AuthProvider>
          <NetworkErrorBoundary>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/whatsapp"
                  element={
                    <ProtectedRoute>
                      <WhatsAppLink />
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
                  path="/metadata"
                  element={
                    <ProtectedRoute>
                      <MetadataManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/text-processing"
                  element={
                    <ProtectedRoute>
                      <TextProcessingDemo />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/openai-test"
                  element={
                    <ProtectedRoute>
                      <OpenAITest />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/semantic-search"
                  element={
                    <ProtectedRoute>
                      <SemanticSearchTest />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </NetworkErrorBoundary>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </Router>
  )
}

export default App
