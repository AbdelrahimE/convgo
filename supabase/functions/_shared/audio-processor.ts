
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import logDebug from "./webhook-logger.ts";

// Initialize Supabase admin client (this will be available in edge functions)
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Helper function to handle audio transcription
 * @param audioDetails Audio details extracted from the message
 * @param instanceName The WhatsApp instance name
 * @param fromNumber The sender's phone number
 * @param evolutionApiKey The API key for EVOLUTION API
 * @returns Object with transcription results and flags
 */
export async function processAudioMessage(
  audioDetails: any, 
  instanceName: string, 
  fromNumber: string, 
  evolutionApiKey: string
): Promise<{ 
  success: boolean; 
  transcription?: string; 
  error?: string; 
  bypassAiProcessing?: boolean; 
  directResponse?: string 
}> {
  try {
    await logDebug('AUDIO_PROCESSING_START', 'Starting audio processing', { instanceName, fromNumber });
    
    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdmin();
    
    // Check if this instance has disabled voice message processing
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instanceError) {
      await logDebug('AUDIO_PROCESSING_INSTANCE_ERROR', 'Failed to get instance data', { error: instanceError });
      return { 
        success: false, 
        error: 'Instance not found',
        transcription: "This is a voice message that could not be processed because the instance was not found."
      };
    }

    // Check if voice processing is disabled for this instance
    const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
      .from('whatsapp_ai_config')
      .select('process_voice_messages, voice_message_default_response, default_voice_language')
      .eq('whatsapp_instance_id', instanceData.id)
      .maybeSingle();

    // Get the preferred language from AI config if available
    const preferredLanguage = aiConfig?.default_voice_language || 'auto';
    await logDebug('AUDIO_LANGUAGE_PREFERENCE', 'Using voice language preference from AI config', { 
     preferredLanguage, 
     instanceId: instanceData.id 
    });

    if (!aiConfigError && aiConfig && aiConfig.process_voice_messages === false) {
      await logDebug('AUDIO_PROCESSING_DISABLED', 'Voice message processing is disabled for this instance', { 
        instanceId: instanceData.id,
        instanceName,
        customResponseExists: !!aiConfig.voice_message_default_response 
      });
      
      // If voice processing is disabled, return the custom message and flag to bypass AI processing
      return {
        success: false,
        error: 'Voice message processing is disabled',
        transcription: aiConfig.voice_message_default_response || "Voice message processing is disabled.",
        bypassAiProcessing: true, // Flag to indicate we should bypass AI processing
        directResponse: aiConfig.voice_message_default_response || "Voice message processing is disabled."
      };
    }
    
    if (!audioDetails.url) {
      return { 
        success: false, 
        error: 'No audio URL available in message',
        transcription: "This is a voice message that could not be processed because no audio URL was found."
      };
    }
    
    // Get the audio URL that we can access with the Evolution API key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // Since downloadAudioFile is also in a shared file we need to call it
    const downloadResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook/download-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        url: audioDetails.url,
        instance: instanceName,
        evolutionApiKey: evolutionApiKey
      })
    });
    
    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      await logDebug('AUDIO_DOWNLOAD_FAILED', 'Failed to get audio URL', { error: errorText });
      return {
        success: false,
        error: `Download error: ${errorText}`,
        transcription: "This is a voice message that could not be transcribed. Voice transcription error: Download failed"
      };
    }
    
    const downloadResult = await downloadResponse.json();
    
    if (!downloadResult.success || !downloadResult.audioUrl) {
      await logDebug('AUDIO_DOWNLOAD_FAILED', 'Failed to get audio URL', { error: downloadResult.error });
      return {
        success: false,
        error: downloadResult.error,
        transcription: "This is a voice message that could not be transcribed. Voice transcription error: " + downloadResult.error
      };
    }
    
    await logDebug('AUDIO_URL_RETRIEVED', 'Successfully retrieved audio URL for transcription');
    
    // Call the transcription function with the preferred language parameter
    const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-voice-transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        audioUrl: downloadResult.audioUrl,
        mimeType: audioDetails.mimeType || 'audio/ogg; codecs=opus',
        instanceName: instanceName,
        evolutionApiKey: evolutionApiKey,
        mediaKey: audioDetails.mediaKey,
        preferredLanguage: preferredLanguage  // Pass the language preference
      })
    });
    
    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      await logDebug('AUDIO_TRANSCRIPTION_API_ERROR', 'Error from transcription API', { status: transcriptionResponse.status, error: errorText });
      
      return {
        success: false,
        error: `Transcription API error: ${transcriptionResponse.status}`,
        transcription: "This is a voice message that could not be transcribed due to a service error."
      };
    }
    
    const transcriptionResult = await transcriptionResponse.json();
    
    if (!transcriptionResult.success) {
      await logDebug('AUDIO_TRANSCRIPTION_FAILED', 'Transcription process failed', { error: transcriptionResult.error });
      
      return {
        success: false,
        error: transcriptionResult.error,
        transcription: "This is a voice message that could not be transcribed."
      };
    }
    
    await logDebug('AUDIO_TRANSCRIPTION_SUCCESS', 'Successfully transcribed audio', { 
      language: transcriptionResult.language,
      preferredLanguage: preferredLanguage,
      transcription: transcriptionResult.transcription?.substring(0, 100) + '...'
    });
    
    return {
      success: true,
      transcription: transcriptionResult.transcription
    };
  } catch (error) {
    await logDebug('AUDIO_PROCESSING_ERROR', 'Error processing audio', { error });
    return { 
      success: false, 
      error: error.message,
      transcription: "This is a voice message that could not be processed due to a technical error."
    };
  }
}
