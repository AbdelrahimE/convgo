
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import * as franc from "https://esm.sh/franc-min@6";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceRole);

// Helper function to detect if text contains Arabic script and its percentage
function detectArabicScript(text) {
  // Arabic Unicode range (0600-06FF)
  const arabicPattern = /[\u0600-\u06FF]/g;
  const matches = text.match(arabicPattern) || [];
  const arabicCharCount = matches.length;
  const totalCharCount = text.length;
  const percentage = totalCharCount > 0 ? (arabicCharCount / totalCharCount) * 100 : 0;
  
  return {
    containsArabicScript: arabicCharCount > 0,
    arabicScriptPercentage: percentage,
    direction: arabicCharCount > 0 ? "rtl" : "ltr"
  };
}

// Helper to get text direction based on detected language
function getTextDirection(language) {
  // Languages that use right-to-left scripts
  const rtlLanguages = ['ara', 'heb', 'urd', 'fas', 'pus', 'snd', 'uig', 'yid'];
  return rtlLanguages.includes(language) ? 'rtl' : 'ltr';
}

// Language detection handler
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    console.log(`Processing language detection for file: ${fileId}`);

    if (!fileId) {
      return new Response(
        JSON.stringify({ error: "File ID is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Update status to processing
    await supabase
      .from("files")
      .update({
        language_detection_status: { status: "processing", last_updated: new Date().toISOString() }
      })
      .eq("id", fileId);

    // Fetch file content
    const { data: fileData, error: fileError } = await supabase
      .from("files")
      .select("text_content")
      .eq("id", fileId)
      .single();

    if (fileError || !fileData) {
      console.error("Error fetching file:", fileError);
      await supabase
        .from("files")
        .update({
          language_detection_status: { 
            status: "error", 
            error: fileError ? fileError.message : "File not found",
            last_updated: new Date().toISOString()
          }
        })
        .eq("id", fileId);
      
      return new Response(
        JSON.stringify({ error: "Failed to fetch file content" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Skip processing if no text content
    if (!fileData.text_content || fileData.text_content.trim() === '') {
      console.log("No text content to process for language detection");
      await supabase
        .from("files")
        .update({
          language_detection_status: { 
            status: "completed", 
            message: "No text content to analyze",
            last_updated: new Date().toISOString()
          }
        })
        .eq("id", fileId);
      
      return new Response(
        JSON.stringify({ message: "No text content to analyze" }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const textContent = fileData.text_content;
    console.log(`Text content length: ${textContent.length} characters`);

    // Detect primary language
    const primaryLanguage = franc.franc(textContent);
    console.log(`Detected primary language: ${primaryLanguage}`);

    // Detect Arabic script
    const arabicScriptDetails = detectArabicScript(textContent);
    console.log(`Arabic script detection:`, arabicScriptDetails);

    // Get text direction
    const textDirection = arabicScriptDetails.containsArabicScript ? 
      "rtl" : getTextDirection(primaryLanguage);
    console.log(`Text direction: ${textDirection}`);

    // Detect multiple languages with confidence scores
    const options = { minLength: 10, only: [] };
    const allLanguages = franc.francAll(textContent, options);
    console.log(`All detected languages:`, allLanguages);

    // Convert to object for easier access in frontend
    const languageConfidence = {};
    const detectedLanguages = [];
    
    allLanguages.forEach(([lang, score]) => {
      languageConfidence[lang] = score;
      detectedLanguages.push(lang);
    });

    // Calculate language distribution
    const langDistribution = {};
    if (textContent.length > 100) {
      // Split into chunks
      const chunks = [];
      const chunkSize = 100;
      for (let i = 0; i < textContent.length; i += chunkSize) {
        chunks.push(textContent.slice(i, i + chunkSize));
      }

      // Detect language for each chunk
      const chunkLanguages = chunks.map(chunk => franc.franc(chunk));
      
      // Calculate distribution
      chunkLanguages.forEach(lang => {
        langDistribution[lang] = (langDistribution[lang] || 0) + 1;
      });

      // Convert to percentages
      Object.keys(langDistribution).forEach(lang => {
        langDistribution[lang] = langDistribution[lang] / chunks.length;
      });
    } else {
      langDistribution[primaryLanguage] = 1;
    }
    
    console.log(`Language distribution:`, langDistribution);

    // Update the file with language information
    const { error: updateError } = await supabase
      .from("files")
      .update({
        primary_language: primaryLanguage,
        detected_languages: detectedLanguages,
        language_confidence: languageConfidence,
        language_distribution: langDistribution,
        arabic_script_details: arabicScriptDetails,
        text_direction: textDirection,
        language_detection_status: { 
          status: "completed", 
          last_updated: new Date().toISOString() 
        }
      })
      .eq("id", fileId);

    if (updateError) {
      console.error("Error updating file language data:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update language data" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`Language detection completed successfully for file: ${fileId}`);
    return new Response(
      JSON.stringify({ 
        message: "Language detection completed", 
        primaryLanguage,
        detectedLanguages 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Language detection error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
