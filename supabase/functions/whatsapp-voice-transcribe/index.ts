
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    console.log("$$$$$ DEPLOYMENT VERIFICATION: Starting voice transcription process - NEW VERIFICATION $$$$$");
    
    // Check for API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error("ERROR: Missing OpenAI API key");
      throw new Error('Missing OpenAI API key');
    }
    console.log("API key validation: OpenAI API key is present");

    // Parse the request body
    const requestData = await req.json();
    console.log("$$$$$ DEPLOYMENT VERIFICATION: Request data received $$$$$", JSON.stringify({
      hasAudioUrl: !!requestData.audioUrl,
      hasMimeType: !!requestData.mimeType,
      hasMediaKey: !!requestData.mediaKey,
      instanceName: requestData.instanceName || 'test'
    }));
    
    const { audioUrl, mimeType, instanceName, evolutionApiKey, mediaKey } = requestData;
    
    if (!audioUrl) {
      console.error("ERROR: Missing audio URL in request");
      throw new Error('Missing audio URL');
    }

    console.log(`Processing transcription request for audio from instance: ${instanceName || 'test'}`);
    console.log(`Audio URL: ${audioUrl.substring(0, 100)}... (truncated)`);
    console.log(`MIME type: ${mimeType || 'Not provided'}`);
    console.log(`Media Key provided: ${!!mediaKey}`);
    console.log(`$$$$$ DEPLOYMENT VERIFICATION: Media Key value: ${mediaKey ? mediaKey.substring(0, 10) + '...' : 'None'} $$$$$`);

    // Set up headers for EVOLUTION API calls
    let headers = {};
    if (evolutionApiKey) {
      headers = {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json'
      };
      console.log('Using provided EVOLUTION API key for audio retrieval');
    }

    // Step 1: Get the audio file - different handling based on URL type and if it's encrypted
    console.log('$$$$$ DEPLOYMENT VERIFICATION: Attempting to retrieve audio file... $$$$$');
    
    let audioBlob;
    let actualMimeType = mimeType || 'audio/ogg; codecs=opus';
    
    try {
      // IMPORTANT: FIRST check for WhatsApp encrypted audio with mediaKey
      // This needs to be the FIRST condition to ensure it takes priority
      if (audioUrl.includes('mmg.whatsapp.net') && mediaKey) {
        console.log('$$$$$ DEPLOYMENT VERIFICATION: ENTERING DECRYPTION SERVICE PATH - This should be used for WhatsApp voice messages $$$$$');
        console.log('Detected WhatsApp encrypted media with mediaKey, using external decryption service');
        
        // Use the external decryption service
        const decryptionUrl = 'https://voice.convgo.com/decrypt-audio';
        console.log(`Calling external decryption service at: ${decryptionUrl}`);
        console.log(`Sending URL: ${audioUrl.substring(0, 50)}... and mediaKey to decryption service`);
        
        const decryptionResponse = await fetch(decryptionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: audioUrl,
            mediaKey: mediaKey
          })
        });
        
        console.log(`$$$$$ DEPLOYMENT VERIFICATION: Decryption service response status: ${decryptionResponse.status} ${decryptionResponse.statusText} $$$$$`);
        
        if (!decryptionResponse.ok) {
          const errorText = await decryptionResponse.text();
          console.error(`ERROR: External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
          console.error(`Response body: ${errorText.substring(0, 200)}... (truncated)`);
          throw new Error(`External decryption service failed: ${decryptionResponse.status} ${decryptionResponse.statusText}`);
        }
        
        // Get the decrypted audio URL
        const decryptionResult = await decryptionResponse.json();
        
        if (!decryptionResult.success || !decryptionResult.audioUrl) {
          console.error(`ERROR: Invalid response from decryption service:`, decryptionResult);
          throw new Error('Invalid response from decryption service');
        }
        
        console.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully decrypted audio, got URL: ${decryptionResult.audioUrl} $$$$$`);
        
        // Now fetch the decrypted audio
        const audioResponse = await fetch(decryptionResult.audioUrl);
        
        console.log(`Decrypted audio fetch status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          console.error(`ERROR: Failed to download decrypted audio: ${audioResponse.status} ${audioResponse.statusText}`);
          console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download decrypted audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
        // Typically WhatsApp voice messages are OGG format
        actualMimeType = 'audio/ogg; codecs=opus';
      }
      // Handle legacy WhatsApp URLs without mediaKey (this should rarely happen now)
      else if (audioUrl.includes('mmg.whatsapp.net')) {
        console.log('$$$$$ DEPLOYMENT VERIFICATION: ENTERING LEGACY PATH - This should NOT be used for WhatsApp voice messages with mediaKey $$$$$');
        
        // WhatsApp URLs require special handling through EVOLUTION API
        if (!evolutionApiKey) {
          console.error("ERROR: Evolution API key required for WhatsApp media but not provided");
          throw new Error('Evolution API key required for WhatsApp media');
        }
        
        console.log('Detected WhatsApp media URL without mediaKey, using Evolution API for download (legacy path)');
        
        // Extract media ID and other necessary info from the URL
        const mediaIdMatch = audioUrl.match(/\/([^\/]+\.enc)/);
        const mediaId = mediaIdMatch ? mediaIdMatch[1] : null;
        
        if (!mediaId) {
          console.error("ERROR: Could not extract media ID from WhatsApp URL");
          throw new Error('Could not extract media ID from WhatsApp URL');
        }
        
        console.log(`Extracted media ID: ${mediaId}`);
        
        // Get base URL from the audio URL
        const baseUrlMatch = audioUrl.match(/https:\/\/[^/]+/);
        const baseUrl = baseUrlMatch ? baseUrlMatch[0] : 'https://api.convgo.com';
        console.log(`Base URL for Evolution API: ${baseUrl}`);
        
        // Extract the instance ID from the URL or use the provided instanceName
        let whatsappInstance = instanceName || 'test';
        console.log(`Using WhatsApp instance: ${whatsappInstance}`);
        
        // Construct the proper download URL for the Evolution API
        // Instead of directly fetching the WhatsApp URL, we'll use the Evolution API's download endpoint
        const downloadUrl = `${baseUrl}/instance/downloadMediaMessage/${whatsappInstance}`;
        console.log(`Evolution API media download URL: ${downloadUrl}`);
        
        // We need to extract information from the audio URL to create the proper request
        const downloadRequestBody = {
          url: audioUrl,
        };
        
        console.log('Sending download request to Evolution API:', JSON.stringify(downloadRequestBody));
        
        // Make the request to download the media through Evolution API
        const downloadResponse = await fetch(downloadUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(downloadRequestBody)
        });
        
        console.log(`Evolution API download response status: ${downloadResponse.status} ${downloadResponse.statusText}`);
        
        if (!downloadResponse.ok) {
          const responseText = await downloadResponse.text();
          console.error(`ERROR: Failed to download audio via Evolution API: ${downloadResponse.status} ${downloadResponse.statusText}`);
          console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio via Evolution API: ${downloadResponse.status} ${downloadResponse.statusText}`);
        }
        
        // The response should be the binary audio data
        audioBlob = await downloadResponse.blob();
        console.log(`Successfully downloaded audio via Evolution API: ${audioBlob.size} bytes`);
      } 
      else if (audioUrl.includes('api.convgo.com')) {
        // Evolution API URLs require the apikey header
        console.log('Detected Evolution API URL, using provided API key');
        const audioResponse = await fetch(audioUrl, { headers });
        
        console.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          console.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      } 
      else if (audioUrl.includes('audio-samples.github.io')) {
        // Test URL - make a simple fetch without any special headers
        console.log('Detected test audio URL, making standard fetch request');
        const audioResponse = await fetch(audioUrl);
        
        console.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          console.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      }
      else {
        // Standard download for other URLs
        console.log('Using standard fetch for audio URL');
        const audioResponse = await fetch(audioUrl);
        
        console.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
        
        if (!audioResponse.ok) {
          const responseText = await audioResponse.text();
          console.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
          throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        audioBlob = await audioResponse.blob();
      }
      
      console.log(`$$$$$ DEPLOYMENT VERIFICATION: Successfully downloaded audio: ${audioBlob.size} bytes $$$$$`);
    } catch (error) {
      console.error('$$$$$ DEPLOYMENT VERIFICATION: ERROR during audio fetch $$$$$:', error);
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
    
    console.log(`Audio MIME type determined as: ${actualMimeType}`);

    // Step 2: Prepare form data for OpenAI Whisper API
    console.log('$$$$$ DEPLOYMENT VERIFICATION: Preparing FormData for OpenAI Whisper API... $$$$$');
    const formData = new FormData();
    
    // Add the audio file to the form data with the appropriate name and type
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    
    // For the Whisper API, we should specify a legitimate ISO language code
    formData.append('language', 'en'); // Default to English
    
    // Set response format to verbose JSON to get more info including language
    formData.append('response_format', 'verbose_json');
    
    console.log('$$$$$ DEPLOYMENT VERIFICATION: Sending request to OpenAI Whisper API... $$$$$');
    
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
      
      console.log(`Whisper API response status: ${whisperResponse.status} ${whisperResponse.statusText}`);
      
      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        console.error('OpenAI API error response:', errorText);
        throw new Error(`OpenAI API error: ${errorText}`);
      }
    } catch (error) {
      console.error('ERROR during OpenAI API call:', error);
      throw new Error(`OpenAI API call failed: ${error.message}`);
    }

    // Step 4: Process and return the response
    let transcriptionResult;
    try {
      transcriptionResult = await whisperResponse.json();
      console.log('$$$$$ DEPLOYMENT VERIFICATION: Successfully received transcription from OpenAI $$$$$');
      console.log('Transcription result:', JSON.stringify(transcriptionResult).substring(0, 200) + '... (truncated)');
    } catch (error) {
      console.error('ERROR parsing OpenAI response:', error);
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
    console.error('$$$$$ DEPLOYMENT VERIFICATION: CRITICAL ERROR in whatsapp-voice-transcribe $$$$$:', error);
    
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
