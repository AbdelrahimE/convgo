import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

// Process OAuth immediately on component load
const processOAuthImmediately = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  
  if (!code || !state) {
    return false;
  }
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    // Process OAuth
    const { data } = await supabase.functions.invoke('google-auth', {
      body: {
        action: 'callback',
        code: code,
        state: state,
        whatsapp_instance_id: JSON.parse(atob(state)).whatsapp_instance_id
      }
    });
    
    if (data?.success) {
      // Success - redirect immediately
      window.location.replace('/data-collection');
      return true;
    }
  } catch (err) {
    console.error('Fast OAuth processing failed:', err);
  }
  
  return false;
};

const OAuthCallbackFast: React.FC = () => {
  const location = useLocation();
  
  useEffect(() => {
    // Try immediate processing
    processOAuthImmediately().then(processed => {
      if (!processed) {
        // Fallback to regular redirect if fast processing failed
        setTimeout(() => {
          window.location.replace('/data-collection');
        }, 3000);
      }
    });
  }, []);
  
  // Minimal render to avoid React Error #31
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Processing authentication...</p>
      </div>
    </div>
  );
};

export default OAuthCallbackFast;