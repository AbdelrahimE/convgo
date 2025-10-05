
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

// Create a simple logger for better debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!apiKey) {
      throw new Error('Evolution API key not configured');
    }

    const { operation, ...params } = await req.json();
    logger.info(`Evolution API request: ${operation}`, params);

    // Base URL for Evolution API
    const baseUrl = 'https://api.convgo.com';
    let url, method, body;

    // Route based on operation
    switch (operation) {
      case 'CREATE_INSTANCE':
        url = `${baseUrl}/instance/create`;
        method = 'POST';
        const requestPayload: any = {
          instanceName: params.instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        };
        
        // Add proxy configuration if provided
        if (params.proxyHost && params.proxyPort) {
          requestPayload.proxyHost = params.proxyHost;
          requestPayload.proxyPort = params.proxyPort;
          requestPayload.proxyProtocol = params.proxyProtocol || 'http';
          
          if (params.proxyUsername) {
            requestPayload.proxyUsername = params.proxyUsername;
          }
          
          if (params.proxyPassword) {
            requestPayload.proxyPassword = params.proxyPassword;
          }
        }
        
        body = JSON.stringify(requestPayload);
        break;

      case 'CONNECT_INSTANCE':
        url = `${baseUrl}/instance/connect/${params.instanceName}`;
        method = 'GET';
        body = null;
        break;

      case 'CHECK_STATUS':
        url = `${baseUrl}/instance/connectionState/${params.instanceName.trim()}`;
        method = 'GET';
        body = null;
        break;

      case 'LOGOUT_INSTANCE':
        url = `${baseUrl}/instance/logout/${params.instanceName}`;
        method = 'DELETE';
        body = null;
        break;

      case 'DELETE_INSTANCE':
        url = `${baseUrl}/instance/delete/${params.instanceName}`;
        method = 'DELETE';
        body = null;
        break;

      case 'CALL_SETTINGS':
        url = `${baseUrl}/settings/set/${params.instanceName}`;
        method = 'POST';
        body = JSON.stringify({
          rejectCall: params.rejectCall, // Correct parameter name as per API documentation
          msgCall: params.rejectCallsMessage,
          groupsIgnore: false,
          alwaysOnline: false,
          readMessages: false,
          syncFullHistory: false,
          readStatus: false
        });
        logger.info(`CALL_SETTINGS request for ${params.instanceName}: rejectCall=${params.rejectCall}, message='${params.rejectCallsMessage}'`);
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    // Make request to Evolution API
    logger.info(`Making ${method} request to ${url}`);
    const response = await fetch(url, {
      method,
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      ...(body ? { body } : {})
    });

    // Process response data
    const responseData = await response.json();
    logger.info(`Evolution API response for ${operation}:`, responseData);

    // Special processing for certain operation types
    if (operation === 'CONNECT_INSTANCE') {
      // Format QR code consistently
      let qrCode = null;
      
      if (responseData.base64 && responseData.base64.startsWith('data:image/')) {
        qrCode = responseData.base64;
      } else if (responseData.qrcode?.base64) {
        qrCode = responseData.qrcode.base64.startsWith('data:image/') 
          ? responseData.qrcode.base64 
          : `data:image/png;base64,${responseData.qrcode.base64}`;
      } else if (responseData.qrcode?.code) {
        qrCode = `data:image/png;base64,${responseData.qrcode.code}`;
      } else if (responseData.code) {
        qrCode = `data:image/png;base64,${responseData.code}`;
      }

      if (!qrCode && !response.ok) {
        throw new Error('No QR code received from server');
      }

      // Return formatted response with QR code
      return new Response(JSON.stringify({ 
        base64: qrCode,
        status: 'success'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (operation === 'CHECK_STATUS') {
      // Map Evolution API connection state to our expected states
      let state = 'close';
      const statusReason = responseData.instance?.state || 'Unknown';

      if (responseData.instance?.state === 'open') {
        state = 'open';
      } else if (responseData.instance?.state === 'connecting') {
        state = 'connecting';
      }

      return new Response(JSON.stringify({
        state,
        statusReason,
        rawResponse: responseData // Include raw response for debugging
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Return standard response for other operations
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.ok ? 200 : 400,
    });

  } catch (error) {
    logger.error('Error in Evolution API function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      status: 'error',
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
