import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { franc } from "https://esm.sh/franc-min@6"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function detectTextLanguage(text: string) {
  try {
    // Split text into chunks for better language detection
    const chunks = text.split(/[.!?]+/).filter(chunk => chunk.trim().length > 30);
    const detectedLanguages = new Set<string>();
    const primaryLanguage = franc(text);

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

async function extractTextWithTika(fileBuffer: ArrayBuffer, contentType: string): Promise<string> {
  console.log('Sending request to Tika server for content type:', contentType);
  
  try {
    const response = await fetch('https://tika.convgo.com/tika', {
      method: 'PUT',
      headers: {
        'Accept': 'text/plain',
        'Content-Type': contentType
      },
      body: fileBuffer
    });

    if (!response.ok) {
      console.error('Tika server error:', response.status, await response.text());
      throw new Error(`Tika server returned status ${response.status}`);
    }

    const extractedText = await response.text();
    console.log('Text extraction successful, length:', extractedText.length);
    return extractedText;
  } catch (error) {
    console.error('Text extraction failed:', error);
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { fileId } = await req.json()
    if (!fileId) {
      throw new Error('File ID is required');
    }
    console.log('Processing file:', fileId)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError) {
      console.error('Failed to get file metadata:', fileError);
      throw new Error(`Failed to get file metadata: ${fileError.message}`)
    }

    if (!fileData) {
      throw new Error('File not found');
    }

    console.log('File metadata retrieved:', { 
      path: fileData.path, 
      type: fileData.mime_type 
    });

    // Update extraction status to processing
    const { error: statusError } = await supabase
      .from('files')
      .update({
        text_extraction_status: {
          status: 'processing',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId)

    if (statusError) {
      console.error('Failed to update processing status:', statusError);
      throw new Error(`Failed to update processing status: ${statusError.message}`);
    }

    // Download file from storage
    const { data: fileContent, error: downloadError } = await supabase
      .storage
      .from('files')
      .download(fileData.path)

    if (downloadError) {
      console.error('Failed to download file:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`)
    }

    if (!fileContent) {
      throw new Error('No file content received');
    }

    // Extract text from file
    let extractedText = '';
    try {
      if (fileData.mime_type === 'text/plain' || fileData.mime_type === 'text/csv') {
        // Handle text files directly
        const blob = new Blob([await fileContent.arrayBuffer()]);
        extractedText = await blob.text();
      } else if (
        fileData.mime_type === 'application/pdf' ||
        fileData.mime_type === 'application/msword' ||
        fileData.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        // Use Tika for PDF and Office documents
        const fileBuffer = await fileContent.arrayBuffer();
        extractedText = await extractTextWithTika(fileBuffer, fileData.mime_type);
      } else {
        throw new Error(`Unsupported file type: ${fileData.mime_type}`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text content extracted from file');
      }

    } catch (error) {
      console.error('Text extraction error:', error);
      throw error;
    }

    // Detect language and text direction
    const { primaryLanguage, detectedLanguages, direction } = await detectTextLanguage(extractedText);
    console.log('Language detection results:', { 
      primaryLanguage, 
      detectedLanguages, 
      direction 
    });

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
      console.error('Failed to update file with extracted text:', updateError);
      throw new Error(`Failed to update file with extracted text: ${updateError.message}`)
    }

    console.log('Text extraction completed successfully for file:', fileId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Text extraction completed',
        languages: detectedLanguages,
        primaryLanguage,
        direction
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error in text extraction:', error)

    // Update file status with error
    if (req.method !== 'OPTIONS') {
      try {
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
      } catch (updateError) {
        console.error('Failed to update error status:', updateError)
      }
    }

    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    )
  }
})
