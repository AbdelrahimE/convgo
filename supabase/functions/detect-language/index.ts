
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detect } from "https://esm.sh/langdetect@0.2.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONFIDENCE_THRESHOLD = 0.1; // 10% minimum confidence
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

interface DetectionResult {
  language: string;
  confidence: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Perform language detection
    const detectionResults: DetectionResult[] = detect(fileData.text_content, { bestResults: true });

    // Filter results by confidence threshold and sort by confidence
    const filteredResults = detectionResults
      .filter(result => result.confidence >= CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence);

    // Calculate language distribution
    const totalConfidence = filteredResults.reduce((sum, result) => sum + result.confidence, 0);
    const languageDistribution = filteredResults.reduce((dist, result) => {
      dist[result.language] = (result.confidence / totalConfidence) * 100;
      return dist;
    }, {} as Record<string, number>);

    // Arabic script detection
    const arabicScriptDetails = {
      containsArabicScript: ARABIC_SCRIPT_REGEX.test(fileData.text_content),
      arabicScriptPercentage: (fileData.text_content.match(ARABIC_SCRIPT_REGEX) || []).length / fileData.text_content.length * 100,
      direction: ARABIC_SCRIPT_REGEX.test(fileData.text_content) ? 'rtl' : 'ltr'
    };

    // Prepare confidence data
    const languageConfidence = filteredResults.reduce((conf, result) => {
      conf[result.language] = result.confidence;
      return conf;
    }, {} as Record<string, number>);

    // Update file with detection results
    const { error: updateError } = await supabaseClient
      .from('files')
      .update({
        primary_language: filteredResults[0]?.language || null,
        detected_languages: filteredResults.map(result => result.language),
        language_confidence: languageConfidence,
        language_distribution: languageDistribution,
        arabic_script_details: arabicScriptDetails,
        text_direction: arabicScriptDetails.direction,
        language_detection_status: {
          status: 'completed',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    if (updateError) throw updateError;

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
