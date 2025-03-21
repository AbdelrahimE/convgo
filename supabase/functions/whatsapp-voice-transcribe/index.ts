
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
    console.log("Starting voice transcription process");
    
    // Check for API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error("ERROR: Missing OpenAI API key");
      throw new Error('Missing OpenAI API key');
    }
    console.log("API key validation: OpenAI API key is present");

    // Parse the request body
    const requestData = await req.json();
    console.log("Request data received:", JSON.stringify({
      hasAudioUrl: !!requestData.audioUrl,
      mimeType: requestData.mimeType || 'Not provided',
      instanceName: requestData.instanceName || 'test'
    }));
    
    const { audioUrl, mimeType, instanceName, evolutionApiKey } = requestData;
    
    if (!audioUrl) {
      console.error("ERROR: Missing audio URL in request");
      throw new Error('Missing audio URL');
    }

    console.log(`Processing transcription request for audio from instance: ${instanceName || 'test'}`);
    console.log(`Audio URL: ${audioUrl.substring(0, 100)}... (truncated)`);
    console.log(`MIME type: ${mimeType || 'Not provided'}`);

    // Set up headers for EVOLUTION API calls if we need to download audio
    let headers = {};
    if (evolutionApiKey) {
      headers = {
        'apikey': evolutionApiKey,
        'Content-Type': 'application/json'
      };
      console.log('Using provided EVOLUTION API key for audio retrieval');
    }

    // Step 1: Download the audio file from the provided URL
    console.log('Attempting to download audio file...');
    
    let audioResponse;
    try {
      // Different fetch approaches based on URL type
      if (audioUrl.includes('mmg.whatsapp.net')) {
        // WhatsApp URLs require special handling
        if (!evolutionApiKey) {
          console.error("ERROR: Evolution API key required for WhatsApp media but not provided");
          throw new Error('Evolution API key required for WhatsApp media');
        }
        
        console.log('Detected WhatsApp media URL, using Evolution API for download');
        
        // Extract media ID from the URL
        const mediaIdMatch = audioUrl.match(/\/([^\/]+\.enc)/);
        const mediaId = mediaIdMatch ? mediaIdMatch[1] : null;
        
        if (!mediaId) {
          console.error("ERROR: Could not extract media ID from WhatsApp URL");
          throw new Error('Could not extract media ID from WhatsApp URL');
        }
        
        console.log(`Extracted media ID: ${mediaId}`);
        audioResponse = await fetch(audioUrl, { headers });
      } 
      else if (audioUrl.includes('api.convgo.com')) {
        // Evolution API URLs require the apikey header
        console.log('Detected Evolution API URL, using provided API key');
        audioResponse = await fetch(audioUrl, { headers });
      } 
      else if (audioUrl.includes('audio-samples.github.io')) {
        // Test URL - make a simple fetch without any special headers
        console.log('Detected test audio URL, making standard fetch request');
        audioResponse = await fetch(audioUrl);
      }
      else {
        // Standard download for other URLs
        console.log('Using standard fetch for audio URL');
        audioResponse = await fetch(audioUrl);
      }
      
      console.log(`Audio download status: ${audioResponse.status} ${audioResponse.statusText}`);
      
      if (!audioResponse.ok) {
        console.error(`ERROR: Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        const responseText = await audioResponse.text();
        console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
        throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }
    } catch (error) {
      console.error('ERROR during audio fetch:', error);
      throw new Error(`Failed to download audio: ${error.message}`);
    }
    
    // Get the audio file as a blob
    console.log('Converting audio response to blob...');
    const audioBlob = await audioResponse.blob();
    console.log(`Successfully downloaded audio: ${audioBlob.size} bytes`);

    // Get the correct mime type - use the one from the response if available,
    // otherwise use the one provided in the request
    let actualMimeType = audioBlob.type || mimeType || 'audio/ogg; codecs=opus';
    
    // For test URLs, ensure we're using the correct MIME type
    if (audioUrl.includes('audio-samples.github.io') && audioUrl.includes('.mp3')) {
      actualMimeType = 'audio/mpeg';
    }
    
    console.log(`Audio MIME type determined as: ${actualMimeType}`);

    // Step 2: Prepare form data for OpenAI Whisper API
    console.log('Preparing FormData for OpenAI Whisper API...');
    const formData = new FormData();
    
    // Add the audio file to the form data with the appropriate name and type
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    
    // For the Whisper API, we should specify a legitimate ISO language code instead of 'auto'
    formData.append('language', 'en'); // Default to English instead of 'auto'
    
    // Set response format to verbose JSON to get more info including language
    formData.append('response_format', 'verbose_json');
    
    console.log('Sending request to OpenAI Whisper API...');
    
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
      console.log('Successfully received transcription from OpenAI');
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
    console.error('CRITICAL ERROR in whatsapp-voice-transcribe:', error);
    
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
