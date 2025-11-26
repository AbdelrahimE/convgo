
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
    logger.log("$$$$$ DEPLOYMENT VERIFICATION: Starting voice transcription process - NEW VERIFICATION $$$$$");

    // Check for API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      logger.error("ERROR: Missing OpenAI API key");
      throw new Error('Missing OpenAI API key');
    }
    logger.log("API key validation: OpenAI API key is present");

    // Get Evolution API hostname for URL detection
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionHostname = evolutionApiUrl ? new URL(evolutionApiUrl).hostname : '';

    // Parse the request body
    const requestData = await req.json();
    logger.log("$$$$$ DEPLOYMENT VERIFICATION: Request data received $$$$$", JSON.stringify({
      hasAudioUrl: !!requestData.audioUrl,
      hasMimeType: !!requestData.mimeType,
      hasMediaKey: !!requestData.mediaKey,
      instanceName: requestData.instanceName || 'test',
      preferredLanguage: requestData.preferredLanguage || 'auto'
    }));
    
    const { audioUrl, mimeType, instanceName, evolutionApiKey, mediaKey, preferredLanguage } = requestData;
    
    if (!audioUrl) {
      logger.error("ERROR: Missing audio URL in request");
      throw new Error('Missing audio URL');
    }

    logger.log(`Processing transcription request for audio from instance: ${instanceName || 'test'}`);
    logger.log(`Audio URL: ${audioUrl.substring(0, 100)}... (truncated)`);
    logger.log(`MIME type: ${mimeType || 'Not provided'}`);
    logger.log(`Media Key provided: ${!!mediaKey}`);
    logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Media Key value: ${mediaKey ? mediaKey.substring(0, 10) + '...' : 'None'} $$$$$`);
    logger.log(`Preferred language: ${preferredLanguage || 'auto'}`);

    // Set up headers for EVOLUTION API calls
    let headers = {};
    if (evolutionApiKey) {
      headers = {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json'
      };
      logger.log('Using provided EVOLUTION API key for audio retrieval');
    }

    // Step 1: Get the audio file - different handling based on URL type and if it's encrypted
    logger.log('$$$$$ DEPLOYMENT VERIFICATION: Attempting to retrieve audio file... $$$$$');
    
    let audioBlob;
    let actualMimeType = mimeType || 'audio/ogg; codecs=opus';
    
    try {
      // Handle WhatsApp encrypted audio with mediaKey
      if (audioUrl.includes('mmg.whatsapp.net') && mediaKey) {
        logger.log('$$$$$ DEPLOYMENT VERIFICATION: ENTERING DECRYPTION SERVICE PATH - This should be used for WhatsApp voice messages $$$$$');
        logger.log('Detected WhatsApp encrypted media with mediaKey, using external decryption service');
        
        // UPDATED: Use the updated external decryption service endpoint
        const decryptionUrl = 'https://voice.convgo.com/decrypt-media';
        logger.log(`Calling external decryption service at: ${decryptionUrl}`);
        logger.log(`Sending URL: ${audioUrl.substring(0, 50)}... and mediaKey to decryption service`);
        
        const decryptionResponse = await fetch(decryptionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: audioUrl,
            mediaKey: mediaKey,
            mimetype: actualMimeType // UPDATED: Added mimetype parameter
          })
        });
        
        logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Decryption service response status: ${decryptionResponse.status} ${decryptionResponse.statusText} $$$$$`);
        
        if (!decryptionResponse.ok) {
          const errorText = await decryptionResponse.text();
          logger.error(`ERROR: External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
          logger.error(`Response body: ${errorText.substring(0, 200)}... (truncated)`);
          throw new Error(`External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
        }
        
        // Get the decrypted audio URL - UPDATED to use new response format
        const decryptionResult = await decryptionResponse.json();
        
        if (!decryptionResult.success || !decryptionResult.mediaUrl) {
          logger.error(`ERROR: Invalid response from decryption service:`, decryptionResult);
          throw new Error('Invalid response from decryption service');
        }
        
        logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully decrypted audio, got URL: ${decryptionResult.mediaUrl} $$$$$`);
        
        // Now fetch the decrypted audio
        const audioResponse = await fetch(decryptionResult.mediaUrl);
        
        logger.log(`Decrypted audio fetch status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          logger.error(`ERROR: Failed to download decrypted audio: ${audioResponse.status} ${audioResponse.statusText}`);
          logger.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download decrypted audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
        // Typically WhatsApp voice messages are OGG format
        actualMimeType = 'audio/ogg; codecs=opus';
      }
      // Handle any WhatsApp URLs without mediaKey as an error case
      else if (audioUrl.includes('mmg.whatsapp.net')) {
        logger.log('$$$$$ DEPLOYMENT VERIFICATION: ERROR - WhatsApp audio URL without mediaKey $$$$$');
        throw new Error('WhatsApp voice messages require a mediaKey for processing. Please update your client to include the mediaKey parameter.');
      } 
      else if (evolutionHostname && audioUrl.includes(evolutionHostname)) {
        // Evolution API URLs require the apikey header
        logger.log('Detected Evolution API URL, using provided API key');
        const audioResponse = await fetch(audioUrl, { headers });
        
        logger.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          logger.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          logger.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      } 
      else if (audioUrl.includes('audio-samples.github.io')) {
        // Test URL - make a simple fetch without any special headers
        logger.log('Detected test audio URL, making standard fetch request');
        const audioResponse = await fetch(audioUrl);
        
        logger.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          logger.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          logger.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      }
      else {
        // Standard download for other URLs
        logger.log('Using standard fetch for audio URL');
        const audioResponse = await fetch(audioUrl);
        
        logger.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          logger.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          logger.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      }
      
      logger.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully downloaded audio: ${audioBlob.size} bytes $$$$$`);
    } catch (error) {
      logger.error('$$$$$ DEPLOYMENT VERIFICATION: ERROR during audio fetch $$$$$:', error);
      throw new Error(`Failed to download audio: ${error.message}`);
    }
    
    // Get the correct mime type - use the one from the response if available,
    // otherwise use the one provided in the request
    if (audioBlob.type) {
      actualMimeType = audioBlob.type;
    }
    
    // For test URLs, ensure we're using the correct MIME type
    if (audioUrl.includes('audio-samples.github.io') && audioUrl.includes('.mp3')) {
      actualMimeType = 'audio/mpeg';
    }
    
    logger.log(`Audio MIME type determined as: ${actualMimeType}`);

    // Step 2: Prepare form data for OpenAI Whisper API
    logger.log('$$$$$ DEPLOYMENT VERIFICATION: Preparing FormData for OpenAI Whisper API... $$$$$');
    const formData = new FormData();
    
    // Add the audio file to the form data with the appropriate name and type
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    
    // Add language parameter if provided and not set to auto
    if (preferredLanguage && preferredLanguage !== 'auto') {
      logger.log(`Setting language parameter to: ${preferredLanguage}`);
      formData.append('language', preferredLanguage);
    } else {
      logger.log('Using language auto-detection (no language specified)');
    }
    
    // Set response format to verbose JSON to get more info including language
    formData.append('response_format', 'verbose_json');
    
    logger.log('$$$$$ DEPLOYMENT VERIFICATION: Sending request to OpenAI Whisper API... $$$$$');
    
    // Step 3: Call the OpenAI Whisper API
    let whisperResponse;
    try {
      whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          // Don't set Content-Type for FormData - the browser will set it automatically with the boundary
        },
        body: formData,
      });
      
      logger.log(`Whisper API response status: ${whisperResponse.status} ${whisperResponse.statusText}`);
      
      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        logger.error('OpenAI API error response:', errorText);
        throw new Error(`OpenAI API error: ${errorText}`);
      }
    } catch (error) {
      logger.error('ERROR during OpenAI API call:', error);
      throw new Error(`OpenAI API call failed: ${error.message}`);
    }

    // Step 4: Process and return the response
    let transcriptionResult;
    try {
      transcriptionResult = await whisperResponse.json();
      logger.log('$$$$$ DEPLOYMENT VERIFICATION: Successfully received transcription from OpenAI $$$$$');
      logger.log('Transcription result:', JSON.stringify(transcriptionResult).substring(0, 200) + '... (truncated)');
    } catch (error) {
      logger.error('ERROR parsing OpenAI response:', error);
      throw new Error(`Failed to parse OpenAI response: ${error.message}`);
    }

    // Return the transcription result
    return new Response(
      JSON.stringify({
        success: true,
        transcription: transcriptionResult.text,
        language: transcriptionResult.language || 'unknown',
        duration: transcriptionResult.duration || null,
        segments: transcriptionResult.segments || null,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    logger.error('$$$$$ DEPLOYMENT VERIFICATION: CRITICAL ERROR in whatsapp-voice-transcribe $$$$$:', error);
    
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
