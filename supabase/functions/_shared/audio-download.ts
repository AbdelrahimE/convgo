
import logDebug from "./webhook-logger.ts";

/**
 * Helper function to download audio file from WhatsApp
 * 
 * @param url The URL of the audio file to download
 * @param instance The WhatsApp instance name
 * @param evolutionApiKey The API key for EVOLUTION API
 * @returns Object with success flag, audioUrl (if successful), and error message (if failed)
 */
export async function downloadAudioFile(url: string, instance: string, evolutionApiKey: string): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
  try {
    await logDebug('AUDIO_DOWNLOAD_START', `Starting audio download request for URL: ${url}`);
    
    // We cannot directly download the encrypted WhatsApp audio file
    // Instead, we need to retrieve the decrypted media file through the EVOLUTION API
    
    if (!evolutionApiKey) {
      await logDebug('AUDIO_DOWNLOAD_ERROR', 'EVOLUTION_API_KEY not available');
      return { 
        success: false, 
        error: 'EVOLUTION API key not available for media download' 
      };
    }
    
    // Prepare Evolution API URL to download media
    // Using the format explained in the Evolution API docs
    const mediaUrl = url.split('?')[0]; // Remove query parameters
    const mediaId = mediaUrl.split('/').pop(); // Extract media ID
    
    if (!mediaId) {
      return { success: false, error: 'Could not extract media ID from URL' };
    }
    
    await logDebug('AUDIO_DOWNLOAD_MEDIA_ID', `Extracted media ID: ${mediaId}`);
    
    // We're returning the URL that will be used with the proper headers in the transcription function
    // This is more reliable than downloading here and passing the bytes
    return {
      success: true,
      audioUrl: url
    };
  } catch (error) {
    await logDebug('AUDIO_DOWNLOAD_ERROR', 'Error processing audio file URL', { error });
    return { success: false, error: error.message };
  }
}
