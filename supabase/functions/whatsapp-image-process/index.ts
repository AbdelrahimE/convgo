
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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
    logger.log("$$$$$ DEPLOYMENT VERIFICATION: Starting image processing - NEW VERIFICATION $$$$$");

    // Get Evolution API hostname for URL detection
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionHostname = evolutionApiUrl ? new URL(evolutionApiUrl).hostname : '';

    // Parse the request body
    const requestData = await req.json();
    logger.log("$$$$$ DEPLOYMENT VERIFICATION: Request data received $$$$$", JSON.stringify({
      hasImageUrl: !!requestData.imageUrl,
      hasMimeType: !!requestData.mimeType,
      hasMediaKey: !!requestData.mediaKey,
      instanceName: requestData.instanceName || 'test'
    }));
    
    const { imageUrl, mimeType, instanceName, evolutionApiKey, mediaKey } = requestData;
    
    if (!imageUrl) {
      logger.error("ERROR: Missing image URL in request");
      throw new Error('Missing image URL');
    }

    logger.log(`Processing image request from instance: ${instanceName || 'test'}`);
    logger.log(`Image URL: ${imageUrl.substring(0, 100)}... (truncated)`);
    logger.log(`MIME type: ${mimeType || 'Not provided'}`);
    logger.log(`Media Key provided: ${!!mediaKey}`);
    logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Media Key value: ${mediaKey ? mediaKey.substring(0, 10) + '...' : 'None'} $$$$$`);

    // Set up headers for EVOLUTION API calls
    let headers = {};
    if (evolutionApiKey) {
      headers = {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json'
      };
      logger.log('Using provided EVOLUTION API key for image retrieval');
    }

    // Process the image - different handling based on URL type and if it's encrypted
    logger.log('$$$$$ DEPLOYMENT VERIFICATION: Attempting to retrieve image... $$$$$');
    
    let imageResult = {
      success: false,
      mediaUrl: '',
      mediaType: ''
    };
    
    const actualMimeType = mimeType || 'image/jpeg';
    
    try {
      // Handle WhatsApp encrypted image with mediaKey
      if (imageUrl.includes('mmg.whatsapp.net') && mediaKey) {
        logger.log('$$$$$ DEPLOYMENT VERIFICATION: ENTERING DECRYPTION SERVICE PATH - This should be used for WhatsApp images $$$$$');
        logger.log('Detected WhatsApp encrypted media with mediaKey, using external decryption service');
        
        // Use the external decryption service endpoint
        const decryptionUrl = 'https://voice.convgo.com/decrypt-media';
        logger.log(`Calling external decryption service at: ${decryptionUrl}`);
        logger.log(`Sending URL: ${imageUrl.substring(0, 50)}... and mediaKey to decryption service`);
        
        const decryptionResponse = await fetch(decryptionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: imageUrl,
            mediaKey: mediaKey,
            mimetype: actualMimeType
          })
        });
        
        logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Decryption service response status: ${decryptionResponse.status} ${decryptionResponse.statusText} $$$$$`);
        
        if (!decryptionResponse.ok) {
          const errorText = await decryptionResponse.text();
          logger.error(`ERROR: External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
          logger.error(`Response body: ${errorText.substring(0, 200)}... (truncated)`);
          throw new Error(`External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
        }
        
        // Get the decrypted image URL
        const decryptionResult = await decryptionResponse.json();
        
        if (!decryptionResult.success || !decryptionResult.mediaUrl) {
          logger.error(`ERROR: Invalid response from decryption service:`, decryptionResult);
          throw new Error('Invalid response from decryption service');
        }
        
        logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully decrypted image, got URL: ${decryptionResult.mediaUrl} $$$$$`);
        
        // Set the result for returning
        imageResult = {
          success: true,
          mediaUrl: decryptionResult.mediaUrl,
          mediaType: decryptionResult.mediaType || 'image'
        };
      }
      // Handle any WhatsApp URLs without mediaKey as an error case
      else if (imageUrl.includes('mmg.whatsapp.net')) {
        logger.log('$$$$$ DEPLOYMENT VERIFICATION: ERROR - WhatsApp image URL without mediaKey $$$$$');
        throw new Error('WhatsApp images require a mediaKey for processing. Please update your client to include the mediaKey parameter.');
      } 
      else if (evolutionHostname && imageUrl.includes(evolutionHostname)) {
        // Evolution API URLs require the apikey header
        logger.log('Detected Evolution API URL, using provided API key');

        // For Evolution API URLs, we just pass through the URL as it's already accessible
        imageResult = {
          success: true,
          mediaUrl: imageUrl,
          mediaType: 'image'
        };
      } 
      else {
        // For other URLs, we just pass through the URL as it's already accessible
        logger.log('Using standard URL for image');
        imageResult = {
          success: true,
          mediaUrl: imageUrl,
          mediaType: 'image'
        };
      }
      
      logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully processed image: ${imageResult.mediaUrl.substring(0, 50)}... $$$$$`);
    } catch (error) {
      logger.error('$$$$$ DEPLOYMENT VERIFICATION: ERROR during image processing $$$$$:', error);
      throw new Error(`Failed to process image: ${error.message}`);
    }

    // Return the image processing result
    return new Response(
      JSON.stringify({
        success: true,
        mediaUrl: imageResult.mediaUrl,
        mediaType: imageResult.mediaType
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    logger.error('$$$$$ DEPLOYMENT VERIFICATION: CRITICAL ERROR in whatsapp-image-process $$$$$:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
