
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as franc from "https://esm.sh/franc-min@6";

// CORS headers for browser compatibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect language in a chunk of text
type LanguageDetectionResult = {
  language: string;
  direction: string;
  isReliable: boolean;
  confidence?: number;
  arabicScriptDetails?: {
    containsArabicScript: boolean;
    arabicScriptPercentage: number;
    direction: string; 
  };
};

// Languages that use Arabic script
const ARABIC_SCRIPT_LANGUAGES = ['ara', 'urd', 'fas', 'pus', 'snd', 'uig'];

// Languages with RTL text direction
const RTL_LANGUAGES = [
  'ara', // Arabic
  'heb', // Hebrew
  'urd', // Urdu
  'fas', // Persian/Farsi
  'pus', // Pashto
  'snd', // Sindhi
  'uig', // Uyghur
  'dv',  // Dhivehi/Maldivian
  'ha',  // Hausa (when written in Arabic script)
  'he',  // Hebrew
  'yi',  // Yiddish
  'arc', // Aramaic
  'syc', // Syriac
];

// Check if a string contains Arabic script characters
function containsArabicScript(text: string): boolean {
  // Regular expression for Arabic script characters (Arabic, Persian, Urdu, etc.)
  const arabicScriptRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicScriptRegex.test(text);
}

// Calculate the percentage of Arabic script characters in a string
function getArabicScriptPercentage(text: string): number {
  if (!text || text.length === 0) return 0;
  
  let arabicScriptCount = 0;
  
  // Count Arabic script characters
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (
      (charCode >= 0x0600 && charCode <= 0x06FF) || // Arabic
      (charCode >= 0x0750 && charCode <= 0x077F) || // Arabic Supplement
      (charCode >= 0x08A0 && charCode <= 0x08FF) || // Arabic Extended-A
      (charCode >= 0xFB50 && charCode <= 0xFDFF) || // Arabic Presentation Forms-A
      (charCode >= 0xFE70 && charCode <= 0xFEFF)    // Arabic Presentation Forms-B
    ) {
      arabicScriptCount++;
    }
  }
  
  // Calculate percentage
  return (arabicScriptCount / text.length) * 100;
}

// Detect language from text
function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      language: 'und',  // Undefined language code
      direction: 'ltr',
      isReliable: false
    };
  }
  
  // Clean the text
  const cleanedText = text.trim();
  
  // Detect language using franc
  const detectedLanguage = franc.franc(cleanedText, { minLength: 10, only: [] });
  const confidence = franc.francAll(cleanedText, { minLength: 10, only: [] })
    .find(item => item[0] === detectedLanguage)?.[1] || 0;
  
  // Determine text direction based on the detected language
  const direction = RTL_LANGUAGES.includes(detectedLanguage) ? 'rtl' : 'ltr';
  
  // Check for Arabic script
  const hasArabicScript = containsArabicScript(cleanedText);
  const arabicScriptPercentage = hasArabicScript ? getArabicScriptPercentage(cleanedText) : 0;
  
  // If we have significant Arabic script but language detection didn't determine an Arabic-script language,
  // it might be a mixed text or incorrectly detected
  const arabicScriptDetails = {
    containsArabicScript: hasArabicScript,
    arabicScriptPercentage,
    direction: arabicScriptPercentage > 30 ? 'rtl' : direction // If >30% is Arabic script, suggest RTL
  };
  
  return {
    language: detectedLanguage,
    direction,
    isReliable: confidence > 0.6,
    confidence,
    arabicScriptDetails
  };
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Get request data
    const { fileId } = await req.json();
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`Processing language detection for file ID: ${fileId}`);
    
    // Mark language detection as in-progress
    await supabase
      .from('files')
      .update({
        language_detection_status: {
          status: 'processing',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);
    
    // Fetch file text content
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('text_content, text_chunks(id, content, chunk_order)')
      .eq('id', fileId)
      .single();
    
    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      
      // Update status to error
      await supabase
        .from('files')
        .update({
          language_detection_status: {
            status: 'error',
            error: fileError?.message || 'File not found',
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
      
      return new Response(
        JSON.stringify({ error: fileError?.message || 'File not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get text content (either from file or combine chunks)
    let textContent = fileData.text_content || '';
    
    if ((!textContent || textContent.trim().length === 0) && fileData.text_chunks) {
      const chunks = fileData.text_chunks;
      if (Array.isArray(chunks) && chunks.length > 0) {
        // Sort chunks by order and combine
        chunks.sort((a, b) => a.chunk_order - b.chunk_order);
        textContent = chunks.map(chunk => chunk.content).join(' ');
      }
    }
    
    if (!textContent || textContent.trim().length === 0) {
      console.warn('No text content found for language detection');
      
      // Update status to error
      await supabase
        .from('files')
        .update({
          language_detection_status: {
            status: 'error',
            error: 'No text content available for language detection',
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
      
      return new Response(
        JSON.stringify({ error: 'No text content available for language detection' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Detecting language for ${textContent.length} characters of text`);
    
    // Analyze full text language
    const langResult = detectLanguage(textContent);
    console.log('Language detection result:', langResult);
    
    // Get confidence scores for multiple languages using francAll
    const languageResults = franc.francAll(textContent, { minLength: 10 });
    console.log('Multiple language results:', languageResults);
    
    // Convert to confidence scores object
    const languageConfidence: Record<string, number> = {};
    const languageDistribution: Record<string, number> = {};
    
    let totalConfidence = 0;
    languageResults.forEach(([lang, conf]) => {
      languageConfidence[lang] = conf;
      totalConfidence += conf;
    });
    
    // Calculate distribution (percentage of total confidence)
    languageResults.forEach(([lang, conf]) => {
      languageDistribution[lang] = totalConfidence > 0 ? conf / totalConfidence : 0;
    });
    
    // Determine primary language and direction
    const primaryLanguage = langResult.language !== 'und' ? langResult.language : null;
    const textDirection = langResult.arabicScriptDetails && 
                         langResult.arabicScriptDetails.arabicScriptPercentage > 30 
                         ? 'rtl' : langResult.direction;
    
    // Get languages with confidence above threshold
    const detectedLanguages = Object.entries(languageConfidence)
      .filter(([lang, conf]) => conf > 0.1 && lang !== 'und')
      .map(([lang]) => lang);
    
    // Update file with language information
    const { error: updateError } = await supabase
      .from('files')
      .update({
        primary_language: primaryLanguage,
        detected_languages: detectedLanguages,
        text_direction: textDirection,
        language_confidence: languageConfidence,
        language_distribution: languageDistribution,
        arabic_script_details: langResult.arabicScriptDetails,
        language_detection_status: {
          status: 'complete',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);
    
    if (updateError) {
      console.error('Error updating file with language data:', updateError);
      
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Language detection complete for file ${fileId}`);
    
    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        fileId,
        primaryLanguage,
        detectedLanguages,
        textDirection,
        languageConfidence,
        languageDistribution,
        arabicScriptDetails: langResult.arabicScriptDetails
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
    
  } catch (error) {
    console.error("Error in language detection:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
