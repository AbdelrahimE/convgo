
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
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      await logDebug('AUDIO_PROCESS_ERROR', 'Missing required Supabase credentials');
      return { 
        success: false,
        error: 'Configuration error: Missing required Supabase credentials' 
      };
    }
    
    // MODIFIED APPROACH: Skip database lookups and directly call the voice transcription service
    // that contains the proper decryption logic
    
    await logDebug('AUDIO_TRANSCRIPTION_DIRECT', 'Directly calling transcription service', {
      audioUrl: audioDetails.url.substring(0, 50) + '...',
      hasMediaKey: !!audioDetails.mediaKey,
      mimeType: audioDetails.mimeType || 'audio/ogg; codecs=opus'
    });
    
    // Call transcription service directly with all necessary information
    const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-voice-transcribe`, {
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
        preferredLanguage: 'auto' // Default to auto-detection
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
