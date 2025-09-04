import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[GoogleAuth] CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[GoogleAuth] New request received:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';

    console.log('[GoogleAuth] Environment variables check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseServiceRoleKey: !!supabaseServiceRoleKey,
      googleClientId: !!googleClientId,
      googleClientSecret: !!googleClientSecret,
      redirectUri: !!redirectUri
    });

    if (!googleClientId || !googleClientSecret || !redirectUri) {
      console.error('[GoogleAuth] Missing Google OAuth credentials:', {
        googleClientId: !!googleClientId,
        googleClientSecret: !!googleClientSecret,
        redirectUri: !!redirectUri
      });
      throw new Error('Google OAuth credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('[GoogleAuth] Request body:', requestBody);
    } catch (bodyError) {
      console.error('[GoogleAuth] Error parsing request body:', bodyError);
      throw new Error('Invalid request body');
    }
    
    const { action, code, whatsapp_instance_id, state } = requestBody;

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    console.log('[GoogleAuth] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[GoogleAuth] No authorization header found');
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('[GoogleAuth] Token length:', token.length);
    
    console.log('[GoogleAuth] Getting user from token...');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    console.log('[GoogleAuth] User authentication result:', {
      user: !!user,
      userId: user?.id,
      userError: userError?.message
    });
    
    if (userError || !user) {
      console.error('[GoogleAuth] User authentication failed:', userError);
      throw new Error('User not authenticated');
    }

    if (action === 'init') {
      // Generate OAuth URL for Google Sheets access
      const scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'openid',
        'email',
        'profile'
      ];

      const stateData = {
        user_id: user.id,
        whatsapp_instance_id,
        timestamp: Date.now()
      };

      const encodedState = btoa(JSON.stringify(stateData));

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.append('client_id', googleClientId);
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('scope', scopes.join(' '));
      authUrl.searchParams.append('access_type', 'offline');
      authUrl.searchParams.append('prompt', 'consent');
      authUrl.searchParams.append('state', encodedState);

      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    if (action === 'callback') {
      // Handle OAuth callback
      if (!code || !state) {
        throw new Error('Missing authorization code or state');
      }

      // Decode and validate state
      const stateData = JSON.parse(atob(state));
      if (stateData.user_id !== user.id) {
        throw new Error('State validation failed');
      }

      // Exchange code for tokens
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Failed to exchange code for tokens: ${errorText}`);
      }

      const tokens = await tokenResponse.json() as GoogleTokenResponse;

      // Get user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const userInfo = await userInfoResponse.json() as GoogleUserInfo;

      console.log('[GoogleAuth] User info received from Google:', {
        userInfo,
        email: userInfo.email,
        emailType: typeof userInfo.email
      });

      // Encrypt tokens before storing
      // In production, use a proper encryption library
      const encryptedTokens = {
        access_token: btoa(tokens.access_token),
        refresh_token: tokens.refresh_token ? btoa(tokens.refresh_token) : null,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      };

      // Check if config already exists
      const { data: existingConfig } = await supabase
        .from('google_sheets_config')
        .select('id')
        .eq('user_id', user.id)
        .eq('whatsapp_instance_id', stateData.whatsapp_instance_id)
        .single();

      if (existingConfig) {
        // Update existing config
        const { error: updateError } = await supabase
          .from('google_sheets_config')
          .update({
            google_tokens: encryptedTokens,
            google_email: userInfo.email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConfig.id);

        if (updateError) throw updateError;
      } else {
        // Create new config
        const { error: insertError } = await supabase
          .from('google_sheets_config')
          .insert({
            user_id: user.id,
            whatsapp_instance_id: stateData.whatsapp_instance_id,
            google_tokens: encryptedTokens,
            google_email: userInfo.email,
            google_sheet_id: '',
            sheet_name: 'Sheet1',
            is_active: true,
          });

        if (insertError) throw insertError;
      }

      const responseData = { 
        success: true, 
        email: userInfo.email 
      };

      console.log('[GoogleAuth] Callback response data:', {
        responseData,
        email: responseData.email,
        emailType: typeof responseData.email,
        success: responseData.success,
        successType: typeof responseData.success
      });

      return new Response(
        JSON.stringify(responseData),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    if (action === 'refresh') {
      // Refresh access token
      const { config_id } = await req.json();

      const { data: config, error: configError } = await supabase
        .from('google_sheets_config')
        .select('google_tokens')
        .eq('id', config_id)
        .eq('user_id', user.id)
        .single();

      if (configError || !config) {
        throw new Error('Configuration not found');
      }

      const refreshToken = config.google_tokens?.refresh_token 
        ? atob(config.google_tokens.refresh_token) 
        : null;

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to refresh token');
      }

      const newTokens = await tokenResponse.json() as GoogleTokenResponse;

      const encryptedTokens = {
        ...config.google_tokens,
        access_token: btoa(newTokens.access_token),
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      };

      const { error: updateError } = await supabase
        .from('google_sheets_config')
        .update({
          google_tokens: encryptedTokens,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config_id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ 
          success: true,
          access_token: newTokens.access_token
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('[GoogleAuth] Catch block - Error details:', {
      error,
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: `GoogleAuth function error: ${error.message}` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});