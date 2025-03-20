
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
    const { audioUrl, mimeType, instanceName } = await req.json();
    
    if (!audioUrl) {
      throw new Error('Missing audio URL');
    }

    console.log(`Received transcription request for audio from instance: ${instanceName}`);
    console.log(`Audio URL: ${audioUrl.substring(0, 50)}... (truncated)`);
    console.log(`MIME type: ${mimeType || 'Not provided'}`);

    // Step 1: Download the audio file from the provided URL
    console.log('Downloading audio file...');
    const audioResponse = await fetch(audioUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    // Get the audio file as a blob
    const audioBlob = await audioResponse.blob();
    console.log(`Successfully downloaded audio: ${audioBlob.size} bytes`);

    // Step 2: Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    
    // Add the audio file to the form data with the appropriate name and type
    formData.append('file', audioBlob, 'audio.opus');
    formData.append('model', 'whisper-1');
    
    // Optional: Set language detection to auto (or specify a language if known)
    formData.append('language', 'auto');
    
    // Optional: Enable text translation to English (if needed)
    // formData.append('response_format', 'text');
    
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
