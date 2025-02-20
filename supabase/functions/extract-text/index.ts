
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { convert } from 'https://deno.land/x/docx2text/mod.ts'
import { read as readPDF } from 'https://deno.land/x/pdf_text_deno/mod.ts'
import { detect } from 'https://deno.land/x/franc@v6.1.0/mod.ts'
import { getLanguageNameFromISOCode } from 'https://deno.land/x/iso_639_1@v1.0.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function detectTextLanguage(text: string) {
  try {
    // Split text into chunks for better language detection
    const chunks = text.split(/[.!?]+/).filter(chunk => chunk.trim().length > 30);
    const detectedLanguages = new Set<string>();
    let primaryLanguage = null;

    // Detect language for each significant chunk
    for (const chunk of chunks) {
      const langCode = detect(chunk);
      if (langCode && langCode !== 'und') {
        const langName = getLanguageNameFromISOCode(langCode);
        if (langName) {
          detectedLanguages.add(langName);
          // Use the first detected language as primary if not set
          if (!primaryLanguage) {
            primaryLanguage = langName;
          }
        }
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

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const textContent = await readPDF(new Uint8Array(arrayBuffer));
    return textContent.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

async function extractTextFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const textContent = await convert(new Uint8Array(arrayBuffer));
    return textContent.trim();
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error('Failed to extract text from DOCX');
  }
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

    // Extract text based on file type
    const arrayBuffer = await fileContent.arrayBuffer();
    let extractedText = '';

    switch (fileData.mime_type) {
      case 'text/plain':
      case 'text/csv':
        extractedText = await new Blob([arrayBuffer]).text();
        break;
      case 'application/pdf':
        extractedText = await extractTextFromPDF(arrayBuffer);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        extractedText = await extractTextFromDOCX(arrayBuffer);
        break;
      default:
        throw new Error(`Unsupported file type: ${fileData.mime_type}`);
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
