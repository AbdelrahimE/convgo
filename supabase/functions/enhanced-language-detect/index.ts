
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { detect } from "https://esm.sh/langdetect@0.2.1";

const CONFIDENCE_THRESHOLD = 0.1; // 10% minimum confidence
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

interface DetectionResult {
  language: string;
  confidence: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileId, text } = await req.json();

    if (!fileId || !text) {
      throw new Error('Missing required parameters');
    }

    // Enhanced language detection with confidence scores
    const detectionResults: DetectionResult[] = detect(text, { bestResults: true });

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
      containsArabicScript: ARABIC_SCRIPT_REGEX.test(text),
      arabicScriptPercentage: (text.match(ARABIC_SCRIPT_REGEX) || []).length / text.length * 100,
      direction: ARABIC_SCRIPT_REGEX.test(text) ? 'rtl' : 'ltr'
    };

    // Prepare confidence data
    const languageConfidence = filteredResults.reduce((conf, result) => {
      conf[result.language] = result.confidence;
      return conf;
    }, {} as Record<string, number>);

    // Get primary language (highest confidence)
    const primaryLanguage = filteredResults[0]?.language || null;

    // Get detected languages array
    const detectedLanguages = filteredResults.map(result => result.language);

    // Update the file record with the new detection results
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabaseClient
      .from('files')
      .update({
        primary_language: primaryLanguage,
        detected_languages: detectedLanguages,
        language_confidence: languageConfidence,
        language_distribution: languageDistribution,
        arabic_script_details: arabicScriptDetails,
        text_direction: arabicScriptDetails.direction
      })
      .eq('id', fileId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        primaryLanguage,
        detectedLanguages,
        languageConfidence,
        languageDistribution,
        arabicScriptDetails
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
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
