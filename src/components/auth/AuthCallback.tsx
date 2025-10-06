import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import logger from '@/utils/logger';
import { getAuthErrorMessage, logAuthError } from '@/utils/authErrors';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        logger.info('Handling auth callback...');
        
        // Get the session from the URL hash
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data.session) {
          logger.info('Authentication successful:', data.session.user.email);
          setStatus('success');
          setMessage(`Welcome ${data.session.user.email}!`);
          
          toast.success("Sign In Successful", {
            description: `Welcome to ConvGo, ${data.session.user.email}!`
          });

          // Redirect to the main application
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        } else {
          // Check for error in URL params
          const error = searchParams.get('error');
          const errorDescription = searchParams.get('error_description');
          
          if (error) {
            throw new Error(errorDescription || error);
          }
          
          throw new Error('No session found after authentication');
        }
      } catch (error: any) {
        logger.error('Auth callback error:', error);
        logAuthError(error, 'Auth Callback');
        
        const friendlyError = getAuthErrorMessage(error);
        setStatus('error');
        setMessage(friendlyError.description);
        
        toast.error(friendlyError.title, {
          description: friendlyError.description
        });

        // Redirect back to auth page after error
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <AlertCircle className="h-8 w-8 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'border-blue-200 bg-blue-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'loading':
        return 'Completing Sign In';
      case 'success':
        return 'Sign In Successful';
      case 'error':
        return 'Sign In Failed';
      default:
        return 'Processing';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-sky-100 px-4">
      <Card className={`w-full max-w-md ${getStatusColor()}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="text-lg">
            {getStatusTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {message}
            </p>
          </div>

          {status === 'loading' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please wait while we complete your Google authentication.
                This should only take a few seconds.
              </AlertDescription>
            </Alert>
          )}

          {status === 'success' && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                You have been successfully signed in! 
                Redirecting you to the application...
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert className="border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                There was an issue completing your sign in. 
                Please try again or contact support if the problem persists.
                Redirecting you back to the sign in page...
              </AlertDescription>
            </Alert>
          )}

          <div className="text-center text-xs text-muted-foreground">
            {status === 'loading' && 'Processing...'}
            {status === 'success' && 'Redirecting in 2 seconds...'}
            {status === 'error' && 'Redirecting in 3 seconds...'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;