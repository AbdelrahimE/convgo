import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OAuthCallbackProps {
  // No props needed as we get data from URL params
}

const OAuthCallback: React.FC<OAuthCallbackProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Processing Google authentication...');

  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        // Extract parameters from URL
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        
        console.log('OAuth callback received:', { 
          hasCode: !!code, 
          hasState: !!state, 
          error: error,
          url: location.search 
        });

        // Handle OAuth errors (user denied access, etc.)
        if (error) {
          throw new Error(`OAuth error: ${error}`);
        }

        // Validate required parameters
        if (!code || !state) {
          throw new Error('Missing required OAuth parameters (code or state)');
        }

        setMessage('Validating authentication and saving credentials...');

        // Decode state to get instance information
        let stateData;
        try {
          stateData = JSON.parse(atob(state));
          console.log('Decoded state:', stateData);
        } catch (e) {
          throw new Error('Invalid state parameter - unable to decode');
        }

        // Get current user for authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          throw new Error('User not authenticated. Please log in again.');
        }

        // Validate state matches current user
        if (stateData.user_id !== user.id) {
          throw new Error('State validation failed - security check');
        }

        // Call the google-auth edge function to handle the callback
        console.log('Calling google-auth edge function with callback action');
        
        const { data, error: functionError } = await supabase.functions.invoke('google-auth', {
          body: {
            action: 'callback',
            code: code,
            state: state,
            whatsapp_instance_id: stateData.whatsapp_instance_id
          }
        });

        if (functionError) {
          console.error('Edge function error:', functionError);
          throw new Error(`Authentication failed: ${functionError.message || 'Unknown error'}`);
        }

        if (!data.success) {
          throw new Error(`Authentication failed: ${data.error || 'Unknown error'}`);
        }

        console.log('Google OAuth completed successfully:', data);
        
        setStatus('success');
        setMessage(`Successfully connected as ${data.email}!`);

        // Show success toast
        toast({
          title: "Google Account Connected",
          description: `Successfully authenticated as ${data.email}`,
        });

        // Redirect to data collection page after a short delay
        setTimeout(() => {
          navigate('/data-collection', { 
            replace: true,
            state: { 
              justConnected: true,
              email: data.email,
              whatsapp_instance_id: stateData.whatsapp_instance_id
            }
          });
        }, 2000);

      } catch (error: any) {
        console.error('OAuth callback error:', error);
        
        setStatus('error');
        setMessage(error.message || 'Authentication failed');
        
        toast({
          title: "Authentication Failed",
          description: error.message || "Failed to connect Google account",
          variant: "destructive",
        });

        // Redirect back to data collection page after error
        setTimeout(() => {
          navigate('/data-collection', { replace: true });
        }, 3000);
      }
    };

    processOAuthCallback();
  }, [location.search, navigate, toast]);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className={`w-full max-w-md ${getStatusColor()}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="text-lg">
            {status === 'loading' && 'Connecting Google Account'}
            {status === 'success' && 'Connection Successful'}
            {status === 'error' && 'Connection Failed'}
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
                Please wait while we securely connect your Google account for data collection.
                This process may take a few seconds.
              </AlertDescription>
            </Alert>
          )}

          {status === 'success' && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Your Google account has been successfully connected! 
                You can now configure data collection and export to Google Sheets.
                Redirecting you back to the Data Collection page...
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert className="border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                There was an issue connecting your Google account. 
                Please try again or contact support if the problem persists.
                Redirecting you back to try again...
              </AlertDescription>
            </Alert>
          )}

          <div className="text-center text-xs text-muted-foreground">
            {status === 'loading' && 'Processing authentication...'}
            {status === 'success' && 'Redirecting in 2 seconds...'}
            {status === 'error' && 'Redirecting in 3 seconds...'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OAuthCallback;