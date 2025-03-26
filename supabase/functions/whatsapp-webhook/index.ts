import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { WebhookData } from '../_shared/escalation-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookData = await req.json() as WebhookData;

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false
      }
    });

    // Extract instance name from the webhook data
    const instance = webhookData.instance;
    const eventType = webhookData.event;

    if (instance) {
      console.log(`[WEBHOOK_INSTANCE] Processing webhook for instance: ${instance} `);

      // Log the entire webhook data for debugging
      console.log(`[WEBHOOK_DATA] Webhook Data:`, webhookData);

      // Save webhook data to Supabase
      const { data: savedData, error: saveError } = await supabase
        .from('webhook_messages')
        .insert({
          instance: instance,
          event: eventType,
          data: webhookData
        })
        .single();

      if (saveError) {
        console.error('[WEBHOOK_SAVE_ERROR] Error saving webhook data:', saveError);
      } else {
        console.log('[WEBHOOK_SAVE_SUCCESS] Webhook data saved successfully:', savedData);
      }

      // Check if this is a message event we should process
      if (eventType === 'messages.upsert') {
        // Extract necessary data from the webhook payload
        const messages = webhookData.data;

        if (messages && messages.length > 0) {
          const message = messages[0]; // Assuming we process the first message

          // Log message details for debugging
          console.log(`[MESSAGE_DETAILS] Processing message:`, {
            remoteJid: message.key.remoteJid,
            pushName: message.pushName,
            text: message.message?.conversation || message.message?.extendedTextMessage?.text
          });
        }

        // Step 1: Check for support escalation
        console.log(`[SUPPORT_ESCALATION_CHECK] Checking message for support escalation`, { instance });
        
        try {
          // Get the instance ID from the database
          const { data: instanceData, error: instanceError } = await supabase
            .from('whatsapp_instances')
            .select('id')
            .eq('instance_name', instance)
            .single();
            
          // Now pass the instance ID as a parameter to the escalation function
          let escalationUrl = `${req.url.split('/whatsapp-webhook')[0]}/whatsapp-support-escalation`;
          
          if (instanceData && instanceData.id) {
            escalationUrl += `?instanceId=${instanceData.id}`;
            console.log(`[SUPPORT_ESCALATION_INSTANCE_FOUND] Instance ID found for escalation check: ${instanceData.id}`);
          }
          
          const escalationResponse = await fetch(escalationUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookData)
          });
          
          if (!escalationResponse.ok) {
            console.error('[SUPPORT_ESCALATION_ERROR] Support escalation failed:', escalationResponse.status, await escalationResponse.text());
          } else {
            const escalationResult = await escalationResponse.json();
            console.log('[SUPPORT_ESCALATION_SUCCESS] Support escalation result:', escalationResult);
          }
        } catch (escalationError) {
          console.error('[SUPPORT_ESCALATION_CATCH_ERROR] Error during support escalation:', escalationError);
        }
      }
      
      if (eventType === 'connection.update') {
        console.log(`[CONNECTION_UPDATE] Processing connection update for instance: ${instance}`);
      }

      if (eventType === 'qrcode.updated') {
        console.log(`[QRCODE_UPDATED] QR Code updated for instance: ${instance}`);
      }
    }
    
    return new Response(JSON.stringify({ data: { message: 'Webhook received and processed' }, status: 200 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
    
  } catch (error) {
    console.error('[WEBHOOK_ERROR] Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message, status: 500 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
