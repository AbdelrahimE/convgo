
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isPendingPasswordReset } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  // If user has a pending password reset, redirect to reset password page
  if (isPendingPasswordReset) {
    return <Navigate to="/auth/reset-password" replace />;
  }

  return <>{children}</>;
}
