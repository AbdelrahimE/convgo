
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import francMin from "https://esm.sh/franc-min@6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours cache for preflight requests
};

const CONFIDENCE_THRESHOLD = 0.1; // 10% minimum confidence
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const MIN_TEXT_LENGTH = 10; // Minimum text length for reliable detection

serve(async (req) => {
  // Handle CORS preflight requests - Updated with proper response
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No content
      headers: {
        ...corsHeaders,
        'Content-Length': '0',
        'Content-Type': 'text/plain'
      }
    });
  }

  try {
    const { fileId } = await req.json();

    if (!fileId) {
      throw new Error('Missing required fileId parameter');
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting language detection for file:', fileId);

    // Update status to processing
    await supabaseClient
      .from('files')
      .update({
        language_detection_status: {
          status: 'processing',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    // Fetch the file's text content
    const { data: fileData, error: fetchError } = await supabaseClient
      .from('files')
      .select('text_content')
      .eq('id', fileId)
      .single();

    if (fetchError || !fileData?.text_content) {
      throw new Error('Failed to fetch file content or content is empty');
    }

    console.log('Text content length:', fileData.text_content.length);

    // Check if text is long enough for reliable detection
    if (fileData.text_content.length < MIN_TEXT_LENGTH) {
      throw new Error('Text content too short for reliable language detection');
    }

    // Perform language detection with franc-min
    const detectedLanguage = francMin(fileData.text_content);
    console.log('Detected language:', detectedLanguage);

    // Arabic script detection
    const arabicScriptDetails = {
      containsArabicScript: ARABIC_SCRIPT_REGEX.test(fileData.text_content),
      arabicScriptPercentage: (fileData.text_content.match(ARABIC_SCRIPT_REGEX) || []).length / fileData.text_content.length * 100,
      direction: ARABIC_SCRIPT_REGEX.test(fileData.text_content) ? 'rtl' : 'ltr'
    };

    // Update file with detection results
    const { error: updateError } = await supabaseClient
      .from('files')
      .update({
        primary_language: detectedLanguage,
        detected_languages: [detectedLanguage],
        language_confidence: { [detectedLanguage]: 1 }, // franc-min doesn't provide confidence scores
        language_distribution: { [detectedLanguage]: 100 },
        arabic_script_details: arabicScriptDetails,
        text_direction: arabicScriptDetails.direction,
        language_detection_status: {
          status: 'completed',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    if (updateError) {
      console.error('Error updating file:', updateError);
      throw updateError;
    }

    console.log('Language detection completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Language detection completed successfully'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Language detection error:', error);

    // Update file status with error
    if (error instanceof Error) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabaseClient
        .from('files')
        .update({
          language_detection_status: {
            status: 'error',
            error: error.message,
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
