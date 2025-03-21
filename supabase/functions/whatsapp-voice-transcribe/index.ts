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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('Missing OpenAI API key');
    }

    // Parse the request body
    const { audioUrl, mimeType, instanceName, evolutionApiKey } = await req.json();
    
    if (!audioUrl) {
      throw new Error('Missing audio URL');
    }

    console.log(`Received transcription request for audio from instance: ${instanceName}`);
    console.log(`Audio URL: ${audioUrl.substring(0, 50)}... (truncated)`);
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
    console.log('Downloading audio file...');
    
    let audioResponse;
    try {
      // Use different fetch approaches based on URL
      if (audioUrl.includes('mmg.whatsapp.net')) {
        // WhatsApp URLs require special handling - we'll need to use the Evolution API
        // to download the media, as direct access might be restricted
        if (!evolutionApiKey) {
          throw new Error('Evolution API key required for WhatsApp media');
        }
        
        console.log('Detected WhatsApp media URL, using Evolution API for download');
        
        // Extract media ID from the URL
        const mediaIdMatch = audioUrl.match(/\/([^\/]+\.enc)/);
        const mediaId = mediaIdMatch ? mediaIdMatch[1] : null;
        
        if (!mediaId) {
          throw new Error('Could not extract media ID from WhatsApp URL');
        }
        
        console.log(`Extracted media ID: ${mediaId}`);
        
        // For testing, if we can't access WhatsApp media directly, we'll just continue
        // and let the next fetch handle it
        audioResponse = await fetch(audioUrl, { headers });
      } else if (audioUrl.includes('api.convgo.com')) {
        // Evolution API URLs require the apikey header
        audioResponse = await fetch(audioUrl, { headers });
      } else {
        // Standard download for other URLs (like test URLs)
        audioResponse = await fetch(audioUrl);
      }
    } catch (error) {
      console.error('Error fetching audio:', error);
      throw new Error(`Failed to download audio: ${error.message}`);
    }
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    // Get the audio file as a blob
    const audioBlob = await audioResponse.blob();
    console.log(`Successfully downloaded audio: ${audioBlob.size} bytes`);

    // Get the correct mime type - use the one from the response if available,
    // otherwise use the one provided in the request
    const actualMimeType = audioBlob.type || mimeType || 'audio/ogg; codecs=opus';
    console.log(`Audio MIME type: ${actualMimeType}`);

    // Step 2: Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    
    // Add the audio file to the form data with the appropriate name and type
    // Note: Whisper API accepts various formats, but will auto-detect format
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    
    // Optional: Set language detection to auto (or specify a language if known)
    formData.append('language', 'auto');
    
    // Optional: Set response format to verbose JSON to get more info including language
    formData.append('response_format', 'verbose_json');
    
    console.log('Sending audio to OpenAI Whisper API...');
    
    // Step 3: Call the OpenAI Whisper API
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        // Don't set Content-Type for FormData - the browser will set it automatically with the boundary
      },
      body: formData,
    });

    // Step 4: Process and return the response
    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${whisperResponse.status} ${whisperResponse.statusText}`);
    }

    const transcriptionResult = await whisperResponse.json();
    console.log('Transcription successful:', transcriptionResult);

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
    console.error('Error in whatsapp-voice-transcribe:', error);
    
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
