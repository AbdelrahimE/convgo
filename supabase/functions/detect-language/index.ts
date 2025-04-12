
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as franc from "https://esm.sh/franc-min@6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger, logDebug } from "../_shared/logger.ts";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Language name mappings for better readability
const LANGUAGE_NAMES: Record<string, string> = {
  arb: "Arabic",
  eng: "English",
  fra: "French",
  spa: "Spanish",
  deu: "German",
  ita: "Italian",
  nld: "Dutch",
  por: "Portuguese",
  rus: "Russian",
  jpn: "Japanese",
  cmn: "Chinese",
  kor: "Korean",
  hin: "Hindi",
  tur: "Turkish",
  urd: "Urdu",
  fas: "Persian",
  heb: "Hebrew",
};

// Languages that use Arabic script and should be grouped under Arabic
const ARABIC_SCRIPT_LANGUAGES = ['arb', 'urd', 'prs', 'pbu', 'pes', 'zlm', 'skr', 'bal', 'kur', 'hau', 'pnb', 'snd', 'uig'];

// Define confidence thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.5;  // 50%
const MINIMUM_CONFIDENCE_THRESHOLD = 0.2;  // 20%

// Configure Supabase client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(supabaseUrl, supabaseServiceKey);
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Add CORS headers to all responses
  const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Parse request
    const { fileId } = await req.json();
    logger.log(`Processing language detection for file: ${fileId}`);
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: "Missing fileId parameter" }),
        { status: 400, headers: responseHeaders }
      );
    }

    const supabase = getSupabaseClient();
    
    // Update status to in-progress
    await supabase
      .from('files')
      .update({
        language_detection_status: {
          status: 'in_progress',
          last_updated: new Date().toISOString(),
        }
      })
      .eq('id', fileId);
    
    // Fetch file content
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('text_content')
      .eq('id', fileId)
      .single();
    
    if (fileError || !fileData) {
      logger.error(`Error retrieving file: ${fileError?.message || "File not found"}`);
      await updateErrorStatus(supabase, fileId, `Failed to retrieve file: ${fileError?.message || "Not found"}`);
      return new Response(
        JSON.stringify({ error: "File not found or content empty" }),
        { status: 404, headers: responseHeaders }
      );
    }
    
    const textContent = fileData.text_content;
    if (!textContent) {
      logger.error(`File ${fileId} has no text content`);
      await updateErrorStatus(supabase, fileId, "No text content available");
      return new Response(
        JSON.stringify({ error: "File has no text content" }),
        { status: 404, headers: responseHeaders }
      );
    }

    // Perform language detection
    logger.log(`Starting language detection for file ${fileId}`);
    const detectionResult = detectLanguages(textContent);
    logger.log(`Language detection results:`, detectionResult);
    
    // Update the file record with language detection results
    const { error: updateError } = await supabase
      .from('files')
      .update({
        primary_language: detectionResult.primaryLanguage,
        detected_languages: detectionResult.detectedLanguages.map(lang => lang.code),
        language_confidence: {
          primary: detectionResult.primaryConfidence,
          all: detectionResult.languageConfidenceMap
        },
        language_distribution: detectionResult.languageDistribution,
        text_direction: detectionResult.textDirection,
        arabic_script_details: detectionResult.arabicScriptDetails,
        language_detection_status: {
          status: 'completed',
          last_updated: new Date().toISOString(),
        }
      })
      .eq('id', fileId);
    
    if (updateError) {
      logger.error(`Error updating file with detection results: ${updateError.message}`);
      await updateErrorStatus(supabase, fileId, `Database update failed: ${updateError.message}`);
      return new Response(
        JSON.stringify({ error: `Failed to update detection results: ${updateError.message}` }),
        { status: 500, headers: responseHeaders }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Language detection completed successfully",
        result: detectionResult
      }),
      { status: 200, headers: responseHeaders }
    );
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Unexpected error in language detection: ${errorMessage}`);
    
    try {
      const { fileId } = await req.json();
      if (fileId) {
        const supabase = getSupabaseClient();
        await updateErrorStatus(supabase, fileId, errorMessage);
      }
    } catch (e) {
      // Ignore errors in error handling
    }
    
    return new Response(
      JSON.stringify({ error: `Server error: ${errorMessage}` }),
      { status: 500, headers: responseHeaders }
    );
  }
});

async function updateErrorStatus(supabase: any, fileId: string, errorDetails: string) {
  await supabase
    .from('files')
    .update({
      language_detection_status: {
        status: 'error',
        error: errorDetails,
        last_updated: new Date().toISOString(),
      }
    })
    .eq('id', fileId);
}

/**
 * Detects languages in the text with improved accuracy
 */
function detectLanguages(text: string) {
  if (!text || text.trim() === '') {
    return {
      primaryLanguage: null,
      primaryConfidence: 0,
      detectedLanguages: [],
      languageConfidenceMap: {},
      languageDistribution: {},
      textDirection: 'ltr',
      arabicScriptDetails: null
    };
  }

  // Sample different parts of the text for more accurate detection
  const samples = sampleText(text);
  
  // Process each sample for language detection
  const sampleResults = samples.map(sample => {
    // Use franc for language detection with expanded options
    const langResult = franc.franc(sample, {
      minLength: 10,
      only: ['eng', 'arb', 'fra', 'spa', 'deu', 'ita', 'nld', 'por', 'rus', 'cmn', 'jpn', 'kor']
    });
    
    return {
      language: langResult,
      confidence: 1.0, // We will calculate real confidence later
      sample
    };
  });
  
  // Count language occurrences across all samples
  const langCounts: Record<string, number> = {};
  sampleResults.forEach(result => {
    if (result.language !== 'und') {
      langCounts[result.language] = (langCounts[result.language] || 0) + 1;
    }
  });
  
  // Calculate confidence scores based on frequency
  const totalSamples = sampleResults.length;
  const languageConfidenceMap: Record<string, number> = {};
  
  Object.entries(langCounts).forEach(([lang, count]) => {
    languageConfidenceMap[lang] = count / totalSamples;
  });
  
  // Special handling for Arabic detection
  const containsArabicText = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  let arabicScriptDetails = null;
  
  if (containsArabicText) {
    // Count Arabic script characters
    const arabicScriptCharCount = countArabicScriptChars(text);
    const totalCharCount = text.length;
    const arabicScriptRatio = arabicScriptCharCount / totalCharCount;
    
    // If we have Arabic script, add Arabic to our detection if not already detected
    if (arabicScriptRatio > 0.1 && !languageConfidenceMap['arb']) {
      languageConfidenceMap['arb'] = arabicScriptRatio;
    }
    
    // Boost Arabic confidence based on character ratio
    if (languageConfidenceMap['arb']) {
      languageConfidenceMap['arb'] = Math.max(languageConfidenceMap['arb'], arabicScriptRatio);
    }
    
    // Create Arabic script details
    arabicScriptDetails = {
      ratio: arabicScriptRatio,
      charCount: arabicScriptCharCount,
      totalChars: totalCharCount
    };
    
    // Handle other Arabic script languages
    Object.keys(languageConfidenceMap).forEach(lang => {
      if (ARABIC_SCRIPT_LANGUAGES.includes(lang) && lang !== 'arb') {
        // If we detect related Arabic-script languages, consolidate them under Arabic
        if (languageConfidenceMap['arb']) {
          languageConfidenceMap['arb'] = Math.max(languageConfidenceMap['arb'], languageConfidenceMap[lang]);
        } else {
          languageConfidenceMap['arb'] = languageConfidenceMap[lang];
        }
        // Remove the specific language variant
        delete languageConfidenceMap[lang];
      }
    });
  }
  
  // Special case for English detection
  const containsLatinText = /[a-zA-Z]/.test(text);
  if (containsLatinText && !languageConfidenceMap['eng']) {
    // Count Latin script characters
    const latinCharCount = (text.match(/[a-zA-Z]/g) || []).length;
    const totalCharCount = text.length;
    const latinRatio = latinCharCount / totalCharCount;
    
    // Add English if we have significant Latin text
    if (latinRatio > 0.1) {
      languageConfidenceMap['eng'] = latinRatio;
    }
  }
  
  // Apply confidence thresholds
  Object.keys(languageConfidenceMap).forEach(lang => {
    if (languageConfidenceMap[lang] < MINIMUM_CONFIDENCE_THRESHOLD) {
      delete languageConfidenceMap[lang];
    }
  });
  
  // Sort languages by confidence
  const sortedLanguages = Object.entries(languageConfidenceMap)
    .sort((a, b) => b[1] - a[1])
    .map(([code, confidence]) => ({
      code,
      name: LANGUAGE_NAMES[code] || code,
      confidence
    }));
  
  // Determine primary language
  const primaryLanguage = sortedLanguages.length > 0 ? sortedLanguages[0].code : null;
  const primaryConfidence = sortedLanguages.length > 0 ? sortedLanguages[0].confidence : 0;
  
  // Calculate normalized language distribution
  const languageDistribution: Record<string, number> = {};
  if (sortedLanguages.length > 0) {
    const totalConfidence = sortedLanguages.reduce((sum, lang) => sum + lang.confidence, 0);
    
    sortedLanguages.forEach(lang => {
      const normalizedConfidence = totalConfidence > 0 
        ? (lang.confidence / totalConfidence) 
        : 0;
      languageDistribution[lang.code] = parseFloat(normalizedConfidence.toFixed(4));
    });
  }
  
  // Determine text direction
  const rtlLanguages = ['arb', 'heb', 'urd', 'fas', 'prs', 'pbu', 'pes'];
  const textDirection = primaryLanguage && rtlLanguages.includes(primaryLanguage) ? 'rtl' : 'ltr';
  
  return {
    primaryLanguage,
    primaryConfidence,
    detectedLanguages: sortedLanguages,
    languageConfidenceMap,
    languageDistribution,
    textDirection,
    arabicScriptDetails
  };
}

/**
 * Breaks text into multiple samples to improve detection accuracy
 */
function sampleText(text: string): string[] {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (cleanText.length <= 100) {
    return [cleanText];
  }
  
  const samples: string[] = [];
  
  // Add full text as one sample
  samples.push(cleanText);
  
  // Add beginning of text
  samples.push(cleanText.substring(0, Math.min(500, cleanText.length)));
  
  // Add middle of text
  if (cleanText.length > 1000) {
    const middleStart = Math.floor(cleanText.length / 2) - 250;
    const middleEnd = Math.floor(cleanText.length / 2) + 250;
    samples.push(cleanText.substring(
      Math.max(0, middleStart), 
      Math.min(cleanText.length, middleEnd)
    ));
  }
  
  // Add end of text
  if (cleanText.length > 500) {
    samples.push(cleanText.substring(Math.max(0, cleanText.length - 500)));
  }
  
  // Add paragraph samples if text is very long
  if (cleanText.length > 2000) {
    const paragraphs = cleanText.split(/\n\s*\n/);
    if (paragraphs.length > 1) {
      // Add first paragraph
      samples.push(paragraphs[0]);
      
      // Add a middle paragraph
      if (paragraphs.length > 2) {
        const middleIndex = Math.floor(paragraphs.length / 2);
        samples.push(paragraphs[middleIndex]);
      }
      
      // Add last paragraph
      samples.push(paragraphs[paragraphs.length - 1]);
    }
  }
  
  return samples.filter(sample => sample.trim().length > 10);
}

/**
 * Counts characters that belong to Arabic script
 */
function countArabicScriptChars(text: string): number {
  // Regex to match Arabic script characters
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const matches = text.match(arabicRegex);
  return matches ? matches.length : 0;
}
