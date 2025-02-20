
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import franc from "https://esm.sh/franc@6.1.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function detectTextLanguage(text: string) {
  try {
    // Split text into chunks for better language detection
    const chunks = text.split(/[.!?]+/).filter(chunk => chunk.trim().length > 30);
    const detectedLanguages = new Set<string>();
    let primaryLanguage = franc(text);

    // Detect language for each significant chunk
    for (const chunk of chunks) {
      const langCode = franc(chunk);
      if (langCode && langCode !== 'und') {
        detectedLanguages.add(langCode);
      }
    }

    return {
      primaryLanguage,
      detectedLanguages: Array.from(detectedLanguages),
      direction: isRTL(text) ? 'rtl' : 'ltr'
    };
  } catch (error) {
    console.error('Language detection error:', error);
    return {
      primaryLanguage: null,
      detectedLanguages: [],
      direction: 'ltr'
    };
  }
}

function isRTL(text: string): boolean {
  const rtlRegex = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { fileId } = await req.json()
    console.log('Processing file:', fileId)

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError) {
      throw new Error(`Failed to get file metadata: ${fileError.message}`)
    }

    // Update extraction status to processing
    await supabase
      .from('files')
      .update({
        text_extraction_status: {
          status: 'processing',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId)

    // Download file from storage
    const { data: fileContent, error: downloadError } = await supabase
      .storage
      .from('files')
      .download(fileData.path)

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`)
    }

    // Extract text from file
    let extractedText = '';
    try {
      // For now, we'll handle text-based files only
      // For PDF and DOCX, we'll need to implement a separate service
      if (fileData.mime_type === 'text/plain' || fileData.mime_type === 'text/csv') {
        const blob = new Blob([await fileContent.arrayBuffer()]);
        extractedText = await blob.text();
      } else {
        throw new Error(`File type ${fileData.mime_type} processing not yet implemented`);
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }

    // Detect language and text direction
    const { primaryLanguage, detectedLanguages, direction } = await detectTextLanguage(extractedText);

    // Update file with extracted text and language information
    const { error: updateError } = await supabase
      .from('files')
      .update({
        text_content: extractedText,
        primary_language: primaryLanguage,
        detected_languages: detectedLanguages,
        text_direction: direction,
        text_extraction_status: {
          status: 'completed',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId)

    if (updateError) {
      throw new Error(`Failed to update file with extracted text: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Text extraction completed',
        languages: detectedLanguages,
        primaryLanguage,
        direction
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in text extraction:', error)

    // Update file status with error
    const { fileId } = await req.json()
    if (fileId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      await supabase
        .from('files')
        .update({
          text_extraction_status: {
            status: 'error',
            error: error.message,
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId)
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
