
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // If we're on the auth page and have a user, redirect to dashboard
  if (location.pathname === '/auth' && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // If we're on the auth page and not logged in, show the auth page
  if (location.pathname === '/auth') {
    return <>{children}</>;
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in and not on auth page, redirect to auth
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // If we have a user and we're not loading, show the protected content
  return <>{children}</>;
}
