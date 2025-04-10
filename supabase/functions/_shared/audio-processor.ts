
import logDebug from "./webhook-logger.ts";

/**
 * Process an audio message by sending it to the voice transcription service
 * 
 * @param audioDetails Details of the audio to process
 * @param instanceName The WhatsApp instance name
 * @param fromNumber The sender's phone number
 * @param evolutionApiKey API key for EVOLUTION API
 * @returns Object with success flag, transcription (if successful), and error message (if failed)
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
  language?: string;
  bypassAiProcessing?: boolean;
  directResponse?: string;
}> {
  try {
    // Check if we have required parameters
    if (!audioDetails || !audioDetails.url || !audioDetails.mediaKey) {
      await logDebug('AUDIO_PROCESS_MISSING_DATA', 'Missing required audio details', { 
        hasUrl: !!audioDetails?.url, 
        hasMediaKey: !!audioDetails?.mediaKey 
      });
      return { 
        success: false, 
        error: 'Missing required audio details for processing' 
      };
    }
    
    // First check if voice message processing is enabled for this instance
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      await logDebug('AUDIO_PROCESS_ERROR', 'Missing required Supabase credentials');
      return { 
        success: false,

        error: 'Configuration error: Missing required Supabase credentials' 
      };
    }
    
    // Initialize Supabase client
    const supabase = {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (field: string, value: any) => ({
            maybeSingle: () => fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&${field}=eq.${value}`, {
              headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              }
            }).then(res => res.json())
          })
        })
      })
    };
    
    // 1. Get instance ID from name
    const instanceResult = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instanceName)
      .maybeSingle();
      
    const instanceId = instanceResult?.id;
    
    if (!instanceId) {
      await logDebug('AUDIO_PROCESS_ERROR', 'Instance not found', { instanceName });
      return { 
        success: false, 
        error: 'Instance not found in database' 
      };
    }
    
    // 2. Check if voice processing is enabled
    const aiConfig = await supabase
      .from('whatsapp_ai_config')
      .select('process_voice_messages,voice_message_default_response,default_voice_language')
      .eq('whatsapp_instance_id', instanceId)
      .maybeSingle();
    
    // If voice processing is explicitly disabled, return early with direct response
    if (aiConfig && aiConfig.process_voice_messages === false) {
      await logDebug('AUDIO_PROCESS_DISABLED', 'Voice processing disabled in settings', {
        instanceName
      });
      
      return {
        success: false,
        error: 'Voice message processing is disabled for this instance',
        bypassAiProcessing: true,
        directResponse: aiConfig.voice_message_default_response || 
                      "I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you."
      };
    }
    
    // Determine preferred language for transcription
    const preferredLanguage = aiConfig?.default_voice_language || 'auto';
    
    // 3. Process the audio for transcription
    const supabaseAdminUrl = Deno.env.get('SUPABASE_URL') || '';
    
    await logDebug('AUDIO_TRANSCRIPTION_REQUEST', 'Sending audio to transcription service', {
      audioUrl: audioDetails.url.substring(0, 50) + '...',
      hasMediaKey: !!audioDetails.mediaKey,
      mimeType: audioDetails.mimeType || 'audio/ogg',
      preferredLanguage
    });
    
    // Call transcription service
    const transcriptionResponse = await fetch(`${supabaseAdminUrl}/functions/v1/whatsapp-voice-transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        audioUrl: audioDetails.url,
        mediaKey: audioDetails.mediaKey,
        mimeType: audioDetails.mimeType || 'audio/ogg; codecs=opus',
        instanceName,
        evolutionApiKey,
        preferredLanguage
      })
    });
    
    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      await logDebug('AUDIO_TRANSCRIPTION_ERROR', 'Error response from transcription service', {
        status: transcriptionResponse.status,
        error: errorText.substring(0, 500)
      });
      
      return {
        success: false,
        error: `Transcription service error: ${transcriptionResponse.status} - ${errorText.substring(0, 100)}`
      };
    }
    
    const result = await transcriptionResponse.json();
    
    if (result.success && result.transcription) {
      await logDebug('AUDIO_TRANSCRIPTION_SUCCESS', 'Successfully transcribed audio', {
        transcription: result.transcription,
        language: result.language || 'unknown',
        duration: result.duration
      });
      
      return {
        success: true,
        transcription: result.transcription,
        language: result.language
      };
    } else {
      await logDebug('AUDIO_TRANSCRIPTION_FAILED', 'Transcription service returned failure', {
        error: result.error
      });
      
      return {
        success: false,
        error: result.error || 'Unknown transcription error',
        // Include a fallback transcription if available
        transcription: result.transcription || null
      };
    }
  } catch (error) {
    await logDebug('AUDIO_PROCESS_EXCEPTION', 'Exception during audio processing', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: `Exception during audio processing: ${error.message}`
    };
  }
}
