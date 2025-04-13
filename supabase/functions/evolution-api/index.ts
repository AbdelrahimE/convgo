
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";
import { logDebug } from "../_shared/webhook-logger.ts";

// Base URL for Evolution API
const EVOLUTION_API_BASE_URL = "https://api.convgo.com";

// Helper function to get API key
function getApiKey(): string {
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!apiKey) {
    throw new Error('EVOLUTION_API_KEY not configured in secrets');
  }
  return apiKey;
}

// Helper to handle API requests
async function makeApiRequest(path: string, method: string, body?: any) {
  const apiKey = getApiKey();
  
  const headers: HeadersInit = {
    'apikey': apiKey,
  };
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const requestOptions: RequestInit = {
    method,
    headers,
  };
  
  if (body) {
    requestOptions.body = JSON.stringify(body);
  }
  
  try {
    await logDebug('EVOLUTION_API_REQUEST', `Making ${method} request to ${path}`, { body });
    
    const response = await fetch(`${EVOLUTION_API_BASE_URL}${path}`, requestOptions);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      await logDebug('EVOLUTION_API_ERROR', `API error: ${response.status}`, errorData);
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    await logDebug('EVOLUTION_API_RESPONSE', `Successful response from ${path}`, data);
    
    return { success: true, data };
  } catch (error) {
    await logDebug('EVOLUTION_API_EXCEPTION', `Exception during API request: ${error.message}`, { path, error });
    return { success: false, error: error.message };
  }
}

// Handler function for the edge function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { action, ...params } = await req.json();
    
    if (!action) {
      throw new Error('Action is required');
    }
    
    let result;
    
    switch (action) {
      case 'create':
        // Create a new WhatsApp instance
        const { instanceName } = params;
        
        if (!instanceName) {
          throw new Error('Instance name is required');
        }
        
        result = await makeApiRequest('/instance/create', 'POST', {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        });
        break;
        
      case 'connect':
        // Get or refresh QR code for an instance
        const { instanceName: instance } = params;
        
        if (!instance) {
          throw new Error('Instance name is required');
        }
        
        result = await makeApiRequest(`/instance/connect/${instance}`, 'GET');
        break;
        
      case 'status':
        // Get status of an instance
        const { instanceName: statusInstance } = params;
        
        if (!statusInstance) {
          throw new Error('Instance name is required');
        }
        
        result = await makeApiRequest(`/instance/connectionState/${statusInstance}`, 'GET');
        break;
        
      case 'logout':
        // Logout/disconnect an instance
        const { instanceName: logoutInstance } = params;
        
        if (!logoutInstance) {
          throw new Error('Instance name is required');
        }
        
        result = await makeApiRequest(`/instance/logout/${logoutInstance}`, 'DELETE');
        break;
        
      case 'delete':
        // Delete an instance
        const { instanceName: deleteInstance } = params;
        
        if (!deleteInstance) {
          throw new Error('Instance name is required');
        }
        
        result = await makeApiRequest(`/instance/delete/${deleteInstance}`, 'DELETE');
        break;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    await logDebug('EVOLUTION_API_HANDLER_ERROR', `Error in edge function: ${error.message}`);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
