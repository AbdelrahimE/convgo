
import logDebug from "./webhook-logger.ts";

/**
 * Helper function to download audio file from WhatsApp
 * 
 * @param url The URL of the audio file to download
 * @param instance The WhatsApp instance name
 * @param evolutionApiKey The API key for EVOLUTION API
 * @param mediaKey The media key for decryption (required for WhatsApp encrypted media)
 * @param mimeType The mime type of the audio file
 * @returns Object with success flag, audioUrl (if successful), and error message (if failed)
 */
export async function downloadAudioFile(
  url: string, 
  instance: string, 
  evolutionApiKey: string, 
  mediaKey?: string, 
  mimeType?: string
): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
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
    
    // Log whether we have the mediaKey, which is crucial for decryption
    await logDebug('AUDIO_DOWNLOAD_MEDIA_KEY', `Media key available: ${!!mediaKey}`, { 
      hasMediaKey: !!mediaKey,
      mimeType: mimeType || 'audio/ogg; codecs=opus'
    });
    
    if (!mediaKey) {
      await logDebug('AUDIO_DOWNLOAD_ERROR', 'Media key not provided for decryption');
      return { success: false, error: 'Media key required for audio decryption but was not provided' };
    }
    
    // Construct a URL that includes context for the Evolution API to decrypt the media
    // The Evolution API expects the URL along with the mediaKey for proper decryption
    // We're returning an object with all necessary information for the transcription function
    return {
      success: true,
      audioUrl: url,
      // Include these properties so they get passed along in the response
      mediaKey,
      mimeType: mimeType || 'audio/ogg; codecs=opus'
    };
  } catch (error) {
    await logDebug('AUDIO_DOWNLOAD_ERROR', 'Error processing audio file URL', { error });
    return { success: false, error: error.message };
  }
}
