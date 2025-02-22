
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detect } from "https://esm.sh/langdetect@0.2.1";
import { corsHeaders } from "../_shared/cors.ts";

const CONFIDENCE_THRESHOLD = 0.1;
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    console.log('Processing file:', fileId);

    if (!fileId) {
      throw new Error('File ID is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get file content
    const { data: fileData, error: fileError } = await supabaseClient
      .from('files')
      .select('text_content')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData?.text_content) {
      console.error('Error fetching file:', fileError);
      throw new Error('Failed to fetch file content');
    }

    const text = fileData.text_content;

    // Perform enhanced language detection
    const detectionResults = detect(text, { bestResults: true });
    console.log('Language detection results:', detectionResults);

    // Filter and process results
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
      containsArabicScript: ARABIC_SCRIPT_REGEX.test(text),
      arabicScriptPercentage: (text.match(ARABIC_SCRIPT_REGEX) || []).length / text.length * 100,
      direction: ARABIC_SCRIPT_REGEX.test(text) ? 'rtl' : 'ltr'
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
        detected_languages: filteredResults.map(r => r.language),
        language_confidence: languageConfidence,
        language_distribution: languageDistribution,
        arabic_script_details: arabicScriptDetails,
        text_direction: arabicScriptDetails.direction,
        text_extraction_status: {
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

    console.log('Successfully processed file:', fileId);

    return new Response(
      JSON.stringify({
        success: true,
        fileId,
        languages: filteredResults.map(r => r.language),
        primaryLanguage: filteredResults[0]?.language || null
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Processing error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400,
      }
    );
  }
});
