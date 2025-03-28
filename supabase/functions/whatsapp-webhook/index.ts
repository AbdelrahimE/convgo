import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const WHISPER_API_URL = Deno.env.get('WHISPER_API_URL') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the webhook data
    const webhookData = await req.json();

    // Destructure data and message for easier access
    const { data, instance } = webhookData;
    const message = data?.message;

    // Check if the event is messages.upsert
    if (webhookData.event !== 'messages.upsert') {
      console.log('Skipping event:', webhookData.event);
      return new Response(JSON.stringify({ success: true, message: 'Not a messages.upsert event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      },
    });

    // Function to transcribe audio
    const transcribeAudio = async (audioUrl: string, mimeType: string, instanceName: string) => {
      console.log(`Attempting to transcribe audio from: ${audioUrl}`);
      try {
        const transcriptionResponse = await fetch(WHISPER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            audioUrl: audioUrl,
            mimeType: mimeType,
            instanceName: instanceName
          }),
        });

        if (!transcriptionResponse.ok) {
          console.error('Failed to transcribe audio:', transcriptionResponse.status, await transcriptionResponse.text());
          return { success: false, error: `Transcription failed: ${transcriptionResponse.statusText}` };
        }

        const transcriptionData = await transcriptionResponse.json();

        if (transcriptionData.success) {
          console.log('Audio transcribed successfully:', transcriptionData.transcription);
          return { success: true, transcription: transcriptionData.transcription };
        } else {
          console.error('Transcription API returned an error:', transcriptionData.error);
          return { success: false, error: transcriptionData.error };
        }
      } catch (error) {
        console.error('Error transcribing audio:', error);
        return { success: false, error: String(error) };
      }
    };

    // Check if it's an audio message
    if (message?.audioMessage) {
      const audioUrl = message.audioMessage.url;
      const mimeType = message.audioMessage.mimetype;

      if (audioUrl && mimeType) {
        // Transcribe the audio
        const transcriptionResult = await transcribeAudio(audioUrl, mimeType, instance);

        if (transcriptionResult.success) {
          const transcribedText = transcriptionResult.transcription;

          // Construct URL for support escalation with transcribed text
          const escalationUrl = new URL(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-support-escalation`);
          escalationUrl.searchParams.append('foundInstanceId', instance);
          escalationUrl.searchParams.append('transcribedText', transcribedText);

          // Forward to support escalation with transcribed text
          const escalationResponse = await fetch(escalationUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
            body: JSON.stringify(webhookData),
          });

          if (!escalationResponse.ok) {
            console.error('Failed to forward to support escalation:', escalationResponse.status, await escalationResponse.text());
            return new Response(JSON.stringify({ success: false, error: 'Failed to forward to support escalation' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const escalationResult = await escalationResponse.json();

          if (escalationResult.skip_ai_processing) {
            console.log('Escalation successful, skipping AI processing.');
            return new Response(JSON.stringify(escalationResult), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          console.error('Audio transcription failed, proceeding with AI:', transcriptionResult.error);
          // Handle transcription failure as needed, possibly proceeding with AI
        }
      } else {
        console.warn('Audio message detected but URL or MIME type missing.');
      }
    }

    // If not an audio message or transcription didn't lead to escalation, proceed with AI

    // Construct URL for AI processing
    const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/openai-process`;

    // Forward the request to the openai-process function
    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
      body: JSON.stringify(webhookData),
    });

    if (!aiResponse.ok) {
      console.error('Failed to forward to openai-process:', aiResponse.status, await aiResponse.text());
      return new Response(JSON.stringify({ success: false, error: 'Failed to forward to openai-process' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await aiResponse.json();

    // Return the response from the openai-process function
    return new Response(JSON.stringify(aiResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in webhook function:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
