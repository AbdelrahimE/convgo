/**
 * Extracts image details from WhatsApp message data
 * 
 * @param messageData The WhatsApp message data object
 * @returns Object containing image details (url, mediaKey, mimeType, caption)
 */
export function extractImageDetails(messageData: any): { 
  url: string | null; 
  mediaKey: string | null;
  mimeType: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
} {
  // Check for imageMessage object
  const imageMessage = messageData?.message?.imageMessage;
  if (imageMessage) {
    return {
      url: imageMessage.url || null,
      mediaKey: imageMessage.mediaKey || null,
      mimeType: imageMessage.mimetype || 'image/jpeg',
      caption: imageMessage.caption || null,
      width: imageMessage.width || null,
      height: imageMessage.height || null
    };
  }
  
  // Check for videoMessage object (also handled as visual content)
  const videoMessage = messageData?.message?.videoMessage;
  if (videoMessage) {
    return {
      url: videoMessage.url || null,
      mediaKey: videoMessage.mediaKey || null,
      mimeType: videoMessage.mimetype || 'video/mp4',
      caption: videoMessage.caption || null,
      width: videoMessage.width || null,
      height: videoMessage.height || null
    };
  }
  
  // No image content found
  return {
    url: null,
    mediaKey: null,
    mimeType: null,
    caption: null,
    width: null,
    height: null
  };
}

/**
 * Determines if a WhatsApp message contains image content
 * 
 * @param messageData The WhatsApp message data object
 * @returns Boolean indicating if the message contains image/visual content
 */
export function hasImageContent(messageData: any): boolean {
  return (
    messageData?.message?.imageMessage || 
    messageData?.message?.videoMessage ||
    (messageData?.messageType === 'imageMessage') ||
    (messageData?.messageType === 'videoMessage')
  );
}

/**
 * Processes an image message by decrypting and preparing it for AI analysis
 * 
 * @param imageDetails The extracted image details
 * @param instanceName The WhatsApp instance name
 * @param userPhone The user's phone number
 * @param evolutionApiKey The Evolution API key
 * @returns Promise with success status and processed image URL
 */
export async function processImageMessage(
  imageDetails: any,
  instanceName: string,
  userPhone: string,
  evolutionApiKey: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {

  // Create a simple logger since we can't use @/utils/logger in edge functions
  const logger = {
    log: (...args: any[]) => console.log(...args),
    error: (...args: any[]) => console.error(...args),
    info: (...args: any[]) => console.info(...args),
    warn: (...args: any[]) => console.warn(...args),
    debug: (...args: any[]) => console.debug(...args),
  };

  try {
    // Get Evolution API hostname for URL detection
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionHostname = evolutionApiUrl ? new URL(evolutionApiUrl).hostname : '';
    if (!imageDetails.url) {
      logger.error('No image URL provided');
      return { success: false, error: 'No image URL provided' };
    }

    logger.info('Processing image message', {
      instanceName,
      userPhone,
      imageUrl: imageDetails.url.substring(0, 50) + '...',
      mimeType: imageDetails.mimeType,
      hasMediaKey: !!imageDetails.mediaKey,
      hasCaption: !!imageDetails.caption
    });

    // Check if this is a WhatsApp encrypted image that needs processing
    if (imageDetails.url.includes('mmg.whatsapp.net') && imageDetails.mediaKey) {
      logger.info('Detected WhatsApp encrypted image, processing via whatsapp-image-process function');

      // Call the whatsapp-image-process function to decrypt and get the image URL
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      
      const imageProcessResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-image-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          imageUrl: imageDetails.url,
          mimeType: imageDetails.mimeType,
          mediaKey: imageDetails.mediaKey,
          instanceName: instanceName,
          evolutionApiKey: evolutionApiKey
        })
      });

      if (!imageProcessResponse.ok) {
        const errorText = await imageProcessResponse.text();
        logger.error('Image processing failed', {
          status: imageProcessResponse.status,
          error: errorText,
          imageUrl: imageDetails.url.substring(0, 50) + '...'
        });
        return { 
          success: false, 
          error: `Image processing failed: ${imageProcessResponse.status} ${errorText}` 
        };
      }

      const imageProcessResult = await imageProcessResponse.json();
      
      if (!imageProcessResult.success || !imageProcessResult.mediaUrl) {
        logger.error('Image processing returned invalid result', {
          result: imageProcessResult,
          imageUrl: imageDetails.url.substring(0, 50) + '...'
        });
        return { 
          success: false, 
          error: 'Image processing returned invalid result' 
        };
      }

      logger.info('Image processing completed successfully', {
        instanceName,
        userPhone,
        processedImageUrl: imageProcessResult.mediaUrl.substring(0, 50) + '...',
        mediaType: imageProcessResult.mediaType
      });

      return {
        success: true,
        imageUrl: imageProcessResult.mediaUrl
      };
    } 
    else if (evolutionHostname && imageDetails.url.includes(evolutionHostname)) {
      // Evolution API URLs are already accessible
      logger.info('Using Evolution API image URL directly');
      return {
        success: true,
        imageUrl: imageDetails.url
      };
    }
    else {
      // For other URLs, assume they're already accessible
      logger.info('Using standard image URL directly');
      return {
        success: true,
        imageUrl: imageDetails.url
      };
    }

  } catch (error) {
    logger.error('Exception during image processing', {
      error: error.message || error,
      instanceName,
      userPhone,
      imageUrl: imageDetails.url?.substring(0, 50) + '...'
    });

    return {
      success: false,
      error: `Exception during image processing: ${error.message || error}`
    };
  }
}