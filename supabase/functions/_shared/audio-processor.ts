
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
    
    // NEW: Fetch the user's preferred language from the database
    let preferredLanguage = 'auto'; // Default to auto if we can't fetch the preference
    
    try {
      await logDebug('AUDIO_FETCH_LANGUAGE_PREF', 'Fetching language preference from database', {
        instanceName
      });
      
      // Create a Supabase client to fetch the language preference
      const fetchLanguageResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_ai_config?whatsapp_instance_id.eq.${instanceName}&select=default_voice_language`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (fetchLanguageResponse.ok) {
        const configs = await fetchLanguageResponse.json();
        
        // If we found a configuration for this instance, use its language preference
        if (configs && configs.length > 0 && configs[0].default_voice_language) {
          preferredLanguage = configs[0].default_voice_language;
          await logDebug('AUDIO_LANGUAGE_PREF_FOUND', 'Found user language preference', {
            language: preferredLanguage,
            instanceName
          });
        } else {
          await logDebug('AUDIO_LANGUAGE_PREF_NOT_FOUND', 'No language preference found, using auto detection', {
            instanceName
          });
        }
      } else {
        await logDebug('AUDIO_LANGUAGE_FETCH_ERROR', 'Error fetching language preference', {
          status: fetchLanguageResponse.status,
          error: await fetchLanguageResponse.text()
        });
      }
    } catch (error) {
      await logDebug('AUDIO_LANGUAGE_FETCH_EXCEPTION', 'Exception when fetching language preference', {
        error: error.message,
        instanceName
      });
      // Continue with auto detection if there's an error
    }
    
    // MODIFIED APPROACH: Skip database lookups and directly call the voice transcription service
    // that contains the proper decryption logic
    
    await logDebug('AUDIO_TRANSCRIPTION_DIRECT', 'Directly calling transcription service', {
      audioUrl: audioDetails.url.substring(0, 50) + '...',
      hasMediaKey: !!audioDetails.mediaKey,
      mimeType: audioDetails.mimeType || 'audio/ogg; codecs=opus',
      preferredLanguage: preferredLanguage // Using the fetched language preference
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
        preferredLanguage: preferredLanguage // Using the fetched preference instead of hardcoding 'auto'
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
