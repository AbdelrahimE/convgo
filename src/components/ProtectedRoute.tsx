
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Don't protect the auth route itself
  if (location.pathname === '/auth') {
    return <>{children}</>;
  }

  console.log('ProtectedRoute:', { user: user?.email, loading, pathname: location.pathname });

  // Give a bit more time for the session to load before redirecting
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only redirect if we're sure there's no user and we're not already on the auth page
  if (!user && !loading && location.pathname !== '/auth') {
    console.log('Redirecting to auth, no user found');
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
