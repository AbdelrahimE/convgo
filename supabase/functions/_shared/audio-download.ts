
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
    
    // Check if we have required parameters
    if (!url) {
      return { success: false, error: 'Missing URL parameter' };
    }
    
    if (!evolutionApiKey) {
      await logDebug('AUDIO_DOWNLOAD_ERROR', 'EVOLUTION_API_KEY not available');
      return { 
        success: false, 
        error: 'EVOLUTION API key not available for media download' 
      };
    }
    
    // Log whether we have the mediaKey, which is crucial for decryption
    await logDebug('AUDIO_DOWNLOAD_MEDIA_KEY', `Media key available: ${!!mediaKey}`, { 
      hasMediaKey: !!mediaKey,
      mimeType: mimeType || 'audio/ogg; codecs=opus'
    });
    
    // For WhatsApp encrypted media, we need the mediaKey
    if (url.includes('mmg.whatsapp.net')) {
      if (!mediaKey) {
        await logDebug('AUDIO_DOWNLOAD_ERROR', 'Media key not provided for WhatsApp encrypted media');
        return { success: false, error: 'Media key required for WhatsApp audio decryption but was not provided' };
      }
      
      // Use the external decryption service to decrypt WhatsApp media
      await logDebug('AUDIO_DOWNLOAD_DECRYPTION', 'Calling external decryption service for WhatsApp media');
      
      const decryptionUrl = 'https://voice.convgo.com/decrypt-media';
      
      try {
        // Send request to the external decryption service
        const decryptResponse = await fetch(decryptionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: url,
            mediaKey: mediaKey,
            mimetype: mimeType || 'audio/ogg; codecs=opus'
          })
        });
        
        if (!decryptResponse.ok) {
          const errorText = await decryptResponse.text();
          await logDebug('AUDIO_DOWNLOAD_DECRYPTION_ERROR', `External decryption service error: ${decryptResponse.status}`, { 
            errorDetails: errorText 
          });
          return { 
            success: false, 
            error: `Decryption service error: ${decryptResponse.status} - ${errorText}`
          };
        }
        
        // Process the decryption service response
        const decryptResult = await decryptResponse.json();
        
        if (!decryptResult.success || !decryptResult.mediaUrl) {
          await logDebug('AUDIO_DOWNLOAD_DECRYPTION_ERROR', 'Invalid response from decryption service', { 
            result: decryptResult 
          });
          return { 
            success: false, 
            error: 'Decryption service returned invalid response'
          };
        }
        
        await logDebug('AUDIO_DOWNLOAD_DECRYPTION_SUCCESS', 'Successfully decrypted WhatsApp media', {
          originalUrl: url.substring(0, 50) + '...',
          decryptedUrl: decryptResult.mediaUrl.substring(0, 50) + '...'
        });
        
        // Return the decrypted media URL from the external service
        return {
          success: true,
          audioUrl: decryptResult.mediaUrl
        };
      } catch (decryptError) {
        await logDebug('AUDIO_DOWNLOAD_DECRYPTION_ERROR', 'Error calling external decryption service', { 
          error: decryptError 
        });
        return { 
          success: false, 
          error: `Decryption service error: ${decryptError.message}`
        };
      }
    } else {
      // For non-WhatsApp URLs, just return the original URL
      // This handles cases where the media is already accessible without decryption
      await logDebug('AUDIO_DOWNLOAD_STANDARD', 'URL is not a WhatsApp media URL, returning as-is');
      return {
        success: true,
        audioUrl: url
      };
    }
  } catch (error) {
    await logDebug('AUDIO_DOWNLOAD_ERROR', 'Error processing audio file URL', { error });
    return { success: false, error: error.message };
  }
}
