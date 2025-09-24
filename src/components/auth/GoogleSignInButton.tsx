import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logger from '@/utils/logger';
import { getAuthErrorMessage, logAuthError } from '@/utils/authErrors';

interface GoogleSignInButtonProps {
  className?: string;
  disabled?: boolean;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ 
  className = "", 
  disabled = false 
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    logger.info('Starting Google OAuth sign in...');

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });

      if (error) {
        throw error;
      }

      logger.info('Google OAuth initiated successfully:', data);
      // The redirect will happen automatically, no need to handle it here
      
    } catch (error: any) {
      logger.error('Google OAuth error:', error);
      logAuthError(error, 'Google OAuth');
      
      const friendlyError = getAuthErrorMessage(error);
      toast.error(friendlyError.title, {
        description: friendlyError.description
      });
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGoogleSignIn}
      disabled={disabled || isLoading}
      variant="outline"
      size="default"
      className={`w-full border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Signing in...
        </>
      ) : (
        <>
          <FcGoogle className="mr-2 h-5 w-5" />
          Google
        </>
      )}
    </Button>
  );
};

export default GoogleSignInButton;