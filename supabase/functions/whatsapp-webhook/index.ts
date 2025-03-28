import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { handleSupportEscalation, WebhookData } from "../_shared/escalation-utils.ts";

// CORS headers to ensure the function can be called from your frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Main serve function to handle requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("$$$$$ DEPLOYMENT VERIFICATION: Starting webhook processing $$$$$");
    
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://api.convgo.com';
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !evolutionApiKey) {
      throw new Error('Missing required environment variables');
    }
    
    // Initialize Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Parse the request body
    const webhookData = await req.json() as WebhookData;
    
    // Extract key information from the webhook data
    const { instance: instanceName, event, data } = webhookData;
    
    // Skip events that are not messages
    if (event !== 'messages.upsert') {
      console.log(`Skipping non-message event: ${event}`);
      return new Response(JSON.stringify({ success: true, action: 'skipped_non_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Skip messages without actual content
    if (!data.message) {
      console.log('Skipping message without content');
      return new Response(JSON.stringify({ success: true, action: 'skipped_empty' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Skip messages from the bot itself
    if (data.key.fromMe) {
      console.log('Skipping message from bot');
      return new Response(JSON.stringify({ success: true, action: 'skipped_bot_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get the phone number from the remote JID
    const phoneNumber = data.key.remoteJid.split('@')[0];
    
    console.log(`Processing message from ${phoneNumber} in instance ${instanceName}`);
    
    // Look up the instance in the database
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_name, is_active')
      .eq('instance_name', instanceName)
      .maybeSingle();
    
    if (instanceError) {
      console.error('Error looking up instance:', instanceError);
      throw new Error(`Failed to look up instance: ${instanceError.message}`);
    }
    
    if (!instanceData) {
      console.error(`Instance not found: ${instanceName}`);
      throw new Error(`Instance not found: ${instanceName}`);
    }
    
    if (!instanceData.is_active) {
      console.log(`Instance ${instanceName} is inactive, skipping processing`);
      return new Response(JSON.stringify({ success: true, action: 'skipped_inactive_instance' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const instanceId = instanceData.id;
    
    // Check for audio messages that need transcription
    if (data.message.audioMessage) {
      console.log(`[AUDIO_PROCESSING_START] Starting audio processing {"instanceName":"${instanceName}","fromNumber":"${phoneNumber}"}`);
      
      // Fetch AI configuration to get preferred language setting
      const { data: aiConfig } = await supabaseAdmin
        .from('whatsapp_ai_config')
        .select('default_voice_language')
        .eq('whatsapp_instance_id', instanceId)
        .maybeSingle();
      
      // Extract the preferred language, defaulting to 'auto' if not set
      const preferredLanguage = aiConfig?.default_voice_language || 'auto';
      console.log(`[AUDIO_LANGUAGE_PREFERENCE] Using language preference: ${preferredLanguage}`);
      
      const audioDetails = data.message.audioMessage;
      
      // Only process voice messages (ptt = Push To Talk)
      if (!audioDetails.ptt) {
        console.log('Skipping non-voice audio message');
        return new Response(JSON.stringify({ success: true, action: 'skipped_non_voice_audio' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      try {
        // Call the voice transcription function
        const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-voice-transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify({
            audioUrl: audioDetails.url,
            mediaKey: audioDetails.mediaKey,
            mimeType: audioDetails.mimetype,
            instanceName: instanceName,
            evolutionApiKey: evolutionApiKey,
            preferredLanguage: preferredLanguage  // Add preferred language parameter
          })
        });
        
        if (!transcriptionResponse.ok) {
          const errorText = await transcriptionResponse.text();
          console.error(`Transcription failed: ${transcriptionResponse.status} ${errorText}`);
          throw new Error(`Transcription failed: ${transcriptionResponse.status} ${errorText}`);
        }
        
        const transcriptionResult = await transcriptionResponse.json();
        
        if (!transcriptionResult.success) {
          console.error('Transcription error:', transcriptionResult.error);
          throw new Error(`Transcription error: ${transcriptionResult.error}`);
        }
        
        console.log(`[AUDIO_TRANSCRIPTION_SUCCESS] Transcribed audio: "${transcriptionResult.transcription.substring(0, 100)}..."`);
        
        // Check for escalation keywords in the transcribed text
        const escalationResult = await handleSupportEscalation(
          webhookData,
          supabaseUrl,
          supabaseAnonKey,
          evolutionApiUrl,
          evolutionApiKey,
          supabaseServiceRoleKey,
          instanceId,
          transcriptionResult.transcription
        );
        
        if (escalationResult.success && escalationResult.action === 'escalated') {
          console.log(`[ESCALATION_SUCCESS] Voice message escalated to human support: ${escalationResult.matched_keyword}`);
          return new Response(JSON.stringify({
            success: true,
            action: 'voice_message_escalated',
            transcription: transcriptionResult.transcription,
            escalation: escalationResult
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // If not escalated, store the transcription for AI processing
        await supabaseAdmin.from('whatsapp_messages').insert({
          whatsapp_instance_id: instanceId,
          message_id: data.key.id,
          user_phone: phoneNumber,
          message_content: transcriptionResult.transcription,
          message_type: 'voice',
          is_from_me: false,
          timestamp: new Date(data.messageTimestamp * 1000).toISOString(),
          raw_data: data
        });
        
        return new Response(JSON.stringify({
          success: true,
          action: 'voice_message_processed',
          transcription: transcriptionResult.transcription
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('Error processing voice message:', error);
        
        // Log the error but don't fail the webhook
        await supabaseAdmin.from('webhook_debug_logs').insert({
          category: 'voice_processing_error',
          message: `Error processing voice message: ${error.message}`,
          data: { error: error.message, webhook_data: webhookData }
        });
        
        return new Response(JSON.stringify({
          success: false,
          error: `Voice processing error: ${error.message}`
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // For text messages, extract the content
    const messageContent = data.message.conversation || data.message.extendedTextMessage?.text || '';
    
    if (!messageContent.trim()) {
      console.log('Skipping empty text message');
      return new Response(JSON.stringify({ success: true, action: 'skipped_empty_text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check for escalation keywords in the text
    const escalationResult = await handleSupportEscalation(
      webhookData,
      supabaseUrl,
      supabaseAnonKey,
      evolutionApiUrl,
      evolutionApiKey,
      supabaseServiceRoleKey,
      instanceId
    );
    
    if (escalationResult.success && escalationResult.action === 'escalated') {
      console.log(`[ESCALATION_SUCCESS] Message escalated to human support: ${escalationResult.matched_keyword}`);
      return new Response(JSON.stringify({
        success: true,
        action: 'message_escalated',
        escalation: escalationResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // If not escalated, store the message for AI processing
    await supabaseAdmin.from('whatsapp_messages').insert({
      whatsapp_instance_id: instanceId,
      message_id: data.key.id,
      user_phone: phoneNumber,
      message_content: messageContent,
      message_type: 'text',
      is_from_me: false,
      timestamp: new Date(data.messageTimestamp * 1000).toISOString(),
      raw_data: data
    });
    
    return new Response(JSON.stringify({
      success: true,
      action: 'message_processed',
      skip_ai_processing: escalationResult.skip_ai_processing || false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
