
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
const WEBHOOK_URL = Deno.env.get('WEBHOOK_URL') || '';

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface WebhookSetupRequest {
  instanceName: string;
  enabled: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceName, enabled } = await req.json() as WebhookSetupRequest;

    if (!instanceName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'instanceName is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`${enabled ? 'Setting up' : 'Removing'} webhook for instance ${instanceName}`);

    if (enabled && !WEBHOOK_URL) {
      throw new Error('WEBHOOK_URL environment variable is not set');
    }

    // Setup webhook with EVOLUTION API
    const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        url: enabled ? WEBHOOK_URL : "",
        webhook: enabled,
        webhookByEvents: enabled,
        events: {
          "APPLICATION_STARTUP": false,
          "QRCODE_UPDATED": false,
          "MESSAGES_SET": false,
          "MESSAGES_UPSERT": enabled,
          "MESSAGES_UPDATE": false,
          "MESSAGES_DELETE": false,
          "SEND_MESSAGE": true,
          "CONTACTS_SET": false,
          "CONTACTS_UPSERT": false,
          "CONTACTS_UPDATE": false,
          "PRESENCE_UPDATE": false,
          "CHATS_SET": false,
          "CHATS_UPSERT": false,
          "CHATS_UPDATE": false,
          "CHATS_DELETE": false,
          "GROUPS_UPSERT": false,
          "GROUP_UPDATE": false,
          "GROUP_PARTICIPANTS_UPDATE": false,
          "CONNECTION_UPDATE": true,
          "CALL": false,
          "NEW_JWT_TOKEN": false
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`EVOLUTION API error: ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    
    // Update the is_active status in the AI config if the webhook setup was successful
    if (responseData.webhook === enabled) {
      const { data: aiConfig, error: fetchError } = await supabase
        .from('whatsapp_ai_config')
        .select('id')
        .eq('whatsapp_instance_id', (
          await supabase
            .from('whatsapp_instances')
            .select('id')
            .eq('instance_name', instanceName)
            .single()
        ).data?.id);
      
      if (fetchError) {
        console.error('Error fetching AI config:', fetchError);
      } else if (aiConfig && aiConfig.length > 0) {
        const { error: updateError } = await supabase
          .from('whatsapp_ai_config')
          .update({ is_active: enabled })
          .eq('id', aiConfig[0].id);
        
        if (updateError) {
          console.error('Error updating AI config:', updateError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in whatsapp-setup-webhook function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
