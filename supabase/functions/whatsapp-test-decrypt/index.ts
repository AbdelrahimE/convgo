
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers to ensure the function can be called from your frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function hkdf(key: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Import the key
  const importedKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Extract step - create a pseudorandom key
  const prk = await crypto.subtle.sign(
    "HMAC",
    importedKey,
    new Uint8Array(32).fill(0)
  );

  // Expand step - generate output keying material
  let t = new Uint8Array(0);
  let okm = new Uint8Array(0);
  let i = 1;

  while (okm.length < length) {
    // Concatenate T(i-1) + info + counter
    const data = new Uint8Array(t.length + info.length + 1);
    data.set(t, 0);
    data.set(info, t.length);
    data[t.length + info.length] = i;

    // Import the PRK
    const prkKey = await crypto.subtle.importKey(
      "raw",
      prk,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Generate T(i)
    t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, data));

    // Concatenate OKM with T(i)
    const newOkm = new Uint8Array(okm.length + t.length);
    newOkm.set(okm, 0);
    newOkm.set(t, okm.length);
    okm = newOkm;

    i++;
  }

  // Return the first 'length' bytes
  return okm.slice(0, length);
}

async function decryptWhatsAppMedia(
  encryptedData: ArrayBuffer,
  mediaKey: Uint8Array,
  mediaType: string = "audio"
): Promise<ArrayBuffer> {
  // Create info buffer for HKDF
  const mediaTypeMapping: Record<string, number> = {
    image: 1,
    video: 2,
    audio: 3,
    document: 4,
    sticker: 13
  };
  
  const typeNum = mediaTypeMapping[mediaType] || 3; // Default to audio if type not found
  const infoBuffer = new Uint8Array([87, 104, 97, 116, 115, 65, 112, 112, 32, 77, 101, 100, 105, 97, 32, 75, 101, 121, 115, typeNum]);
  
  // Derive keys using HKDF
  const expandedKey = await hkdf(mediaKey, infoBuffer, 112);
  
  // Extract components from expanded key
  const iv = expandedKey.slice(0, 16);
  const cipherKey = expandedKey.slice(16, 48);
  
  try {
    // Import the AES key
    const key = await crypto.subtle.importKey(
      "raw",
      cipherKey,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    
    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      key,
      encryptedData
    );
    
    return decryptedData;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error(`Failed to decrypt media: ${error.message}`);
  }
}

// Main serve function to handle requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting WhatsApp media test decryption process");
    
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
      hasMediaKey: !!requestData.mediaKey
    }));
    
    const { audioUrl, mediaKey } = requestData;
    
    if (!audioUrl) {
      console.error("ERROR: Missing audio URL in request");
      throw new Error('Missing audio URL');
    }
    
    if (!mediaKey) {
      console.error("ERROR: Missing media key in request");
      throw new Error('Missing media key for decryption');
    }

    console.log(`Processing decryption request for audio: ${audioUrl.substring(0, 100)}... (truncated)`);
    
    try {
      // Step 1: Download the encrypted audio file
      console.log('Downloading encrypted media file...');
      const mediaResponse = await fetch(audioUrl);
      
      if (!mediaResponse.ok) {
        const responseText = await mediaResponse.text();
        console.error(`ERROR: Failed to download encrypted media: ${mediaResponse.status} ${mediaResponse.statusText}`);
        console.error(`Response body: ${responseText.substring(0, 200)}... (truncated)`);
        throw new Error(`Failed to download encrypted media: ${mediaResponse.status} ${mediaResponse.statusText}`);
      }
      
      const encryptedBuffer = await mediaResponse.arrayBuffer();
      console.log(`Downloaded encrypted data: ${encryptedBuffer.byteLength} bytes`);
      
      // Step 2: Convert media key from base64 to array buffer
      console.log('Converting media key and preparing for decryption...');
      const mediaKeyBuffer = base64ToArrayBuffer(mediaKey);
      
      // Step 3: Decrypt the media
      console.log('Attempting to decrypt media...');
      const decryptedBuffer = await decryptWhatsAppMedia(encryptedBuffer, mediaKeyBuffer);
      console.log(`Decryption successful! Decrypted data size: ${decryptedBuffer.byteLength} bytes`);
      
      // Step 4: Prepare for Whisper API
      console.log('Preparing data for Whisper API...');
      const audioBlob = new Blob([decryptedBuffer], { type: 'audio/ogg; codecs=opus' });
      
      // Step 5: Prepare form data for OpenAI Whisper API
      console.log('Preparing FormData for OpenAI Whisper API...');
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.ogg');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // Default to English
      formData.append('response_format', 'verbose_json');
      
      // Step 6: Call the OpenAI Whisper API
      console.log('Sending request to OpenAI Whisper API...');
      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
        },
        body: formData,
      });
      
      console.log(`Whisper API response status: ${whisperResponse.status} ${whisperResponse.statusText}`);
      
      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        console.error('OpenAI API error response:', errorText);
        throw new Error(`OpenAI API error: ${errorText}`);
      }
      
      // Step 7: Process and return the response
      const transcriptionResult = await whisperResponse.json();
      console.log('Successfully received transcription from OpenAI');
      console.log('Transcription result:', JSON.stringify(transcriptionResult).substring(0, 200) + '... (truncated)');

      // Return the transcription result
      return new Response(
        JSON.stringify({
          success: true,
          transcription: transcriptionResult.text,
          language: transcriptionResult.language || 'unknown',
          duration: transcriptionResult.duration || null,
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    } catch (error) {
      console.error('Error during media processing:', error);
      throw new Error(`Media processing failed: ${error.message}`);
    }

  } catch (error) {
    console.error('CRITICAL ERROR in whatsapp-test-decrypt:', error);
    
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
