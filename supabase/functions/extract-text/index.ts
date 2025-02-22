
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { franc } from "https://esm.sh/franc-min@6"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Enhanced language detection with better Arabic script support
async function detectTextLanguage(text: string) {
  try {
    // Split text into meaningful chunks (sentences/paragraphs)
    const chunks = text
      .split(/[.!?؟\n]+/)
      .filter(chunk => chunk.trim().length > 30);
    
    const detectedLanguages = new Set<string>();
    const languageScores: Record<string, number[]> = {};
    let totalScore = 0;
    
    // Enhanced language detection for each chunk
    for (const chunk of chunks) {
      const langCode = franc(chunk, { minLength: 1 });
      if (langCode && langCode !== 'und') {
        detectedLanguages.add(langCode);
        if (!languageScores[langCode]) {
          languageScores[langCode] = [];
        }
        const score = chunk.length / text.length; // Weight by chunk length
        languageScores[langCode].push(score);
        totalScore += score;
      }
    }

    // Calculate normalized confidence scores and distribution
    const languageConfidence: Record<string, number> = {};
    const languageDistribution: Record<string, number> = {};
    
    for (const [lang, scores] of Object.entries(languageScores)) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const normalizedScore = avgScore / totalScore;
      languageConfidence[lang] = Math.round(normalizedScore * 100) / 100;
      languageDistribution[lang] = Math.round(normalizedScore * 100);
    }

    // Determine primary language based on confidence
    const primaryLanguage = Object.entries(languageConfidence)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Enhanced Arabic script analysis
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const arabicMatches = text.match(arabicPattern) || [];
    const totalChars = text.length;
    const arabicChars = arabicMatches.length;
    const arabicPercentage = (arabicChars / totalChars) * 100;

    const arabicScriptDetails = {
      containsArabicScript: arabicChars > 0,
      arabicScriptPercentage: Math.round(arabicPercentage * 100) / 100,
      direction: arabicPercentage > 30 ? 'rtl' : 'ltr'
    };

    console.log('Language detection results:', {
      primaryLanguage,
      detectedLanguages: Array.from(detectedLanguages),
      confidence: languageConfidence,
      distribution: languageDistribution,
      arabicDetails: arabicScriptDetails
    });

    return {
      primaryLanguage,
      detectedLanguages: Array.from(detectedLanguages),
      direction: arabicScriptDetails.direction,
      confidence: languageConfidence,
      distribution: languageDistribution,
      arabicScriptDetails
    };
  } catch (error) {
    console.error('Language detection error:', error);
    return {
      primaryLanguage: null,
      detectedLanguages: [],
      direction: 'ltr',
      confidence: {},
      distribution: {},
      arabicScriptDetails: {
        containsArabicScript: false,
        arabicScriptPercentage: 0,
        direction: 'ltr'
      }
    };
  }
}

// Smart text chunking with Arabic support
function createTextChunks(text: string, maxChunkSize = 1500) {
  const chunks: string[] = [];
  let currentChunk = '';

  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/);

  for (const paragraph of paragraphs) {
    // If paragraph is too long, split by sentences
    if (paragraph.length > maxChunkSize) {
      // Handle both English and Arabic sentence endings
      const sentences = paragraph.split(/(?<=[.!?؟])\s+/);
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          
          // If single sentence is too long, split by words while preserving RTL
          if (sentence.length > maxChunkSize) {
            const words = sentence.split(/\s+/);
            for (const word of words) {
              if (currentChunk.length + word.length > maxChunkSize) {
                chunks.push(currentChunk.trim());
                currentChunk = word + ' ';
              } else {
                currentChunk += word + ' ';
              }
            }
          } else {
            currentChunk = sentence + ' ';
          }
        } else {
          currentChunk += sentence + ' ';
        }
      }
    } else {
      if (currentChunk.length + paragraph.length > maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph + '\n\n';
      } else {
        currentChunk += paragraph + '\n\n';
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Validate text content with enhanced UTF-8 and Arabic support
function validateTextContent(text: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Check for null or empty content
    if (!text || text.trim().length === 0) {
      errors.push('Empty or null content');
      return { isValid: false, errors };
    }

    // Validate UTF-8 encoding
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    
    try {
      const encoded = encoder.encode(text);
      decoder.decode(encoded);
    } catch (e) {
      errors.push('Invalid UTF-8 encoding');
      return { isValid: false, errors };
    }

    // Check for corrupt Arabic characters
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    if (arabicPattern.test(text)) {
      // Check for common Arabic text corruption patterns
      if (/Ø|Ù|æ|ç/.test(text)) {
        errors.push('Possible corrupt Arabic characters detected');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Validation error:', error);
    errors.push(`Validation error: ${error.message}`);
    return { isValid: false, errors };
  }
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

async function performLanguageDetection(supabase: any, fileId: string, extractedText: string) {
  console.log('Starting language detection for file:', fileId);
  
  try {
    // Update language detection status to processing
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

    // Perform enhanced language detection
    const { 
      primaryLanguage, 
      detectedLanguages, 
      direction, 
      confidence, 
      distribution, 
      arabicScriptDetails 
    } = await detectTextLanguage(extractedText);

    console.log('Language detection completed, updating database with:', {
      primaryLanguage,
      detectedLanguages,
      direction,
      confidence,
      distribution,
      arabicScriptDetails
    });

    // Update file with enhanced language information
    const { error: updateError } = await supabase
      .from('files')
      .update({
        primary_language: primaryLanguage,
        detected_languages: detectedLanguages,
        text_direction: direction,
        language_confidence: confidence,
        language_distribution: distribution,
        arabic_script_details: arabicScriptDetails,
        language_detection_status: {
          status: 'completed',
          error: null,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    if (updateError) {
      throw new Error(`Failed to update language detection results: ${updateError.message}`);
    }

    console.log('Language detection completed successfully for file:', fileId);
    return { success: true };

  } catch (error) {
    console.error('Language detection failed:', error);
    
    // Update status to error
    await supabase
      .from('files')
      .update({
        language_detection_status: {
          status: 'error',
          error: error.message,
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    throw error;
  }
}

serve(async (req) => {
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
        const blob = new Blob([await fileContent.arrayBuffer()]);
        extractedText = await blob.text();
      } else {
        const fileBuffer = await fileContent.arrayBuffer();
        extractedText = await extractTextWithTika(fileBuffer, fileData.mime_type);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text content extracted from file');
      }

      // Create and validate text chunks
      const chunks = createTextChunks(extractedText);
      const validatedChunks = chunks.map((chunk, index) => {
        const validation = validateTextContent(chunk);
        return {
          content: chunk,
          validation_status: validation,
          chunk_order: index
        };
      });

      // Insert chunks into database
      const { error: chunksError } = await supabase
        .from('text_chunks')
        .insert(validatedChunks.map(chunk => ({
          file_id: fileId,
          content: chunk.content,
          chunk_order: chunk.chunk_order,
          validation_status: chunk.validation_status
        })));

      if (chunksError) {
        throw new Error(`Failed to store text chunks: ${chunksError.message}`);
      }

      // Update file with extracted text
      const { error: updateError } = await supabase
        .from('files')
        .update({
          text_content: extractedText,
          text_extraction_status: {
            status: 'completed',
            error: null,
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);

      if (updateError) {
        throw new Error(`Failed to update file with extracted text: ${updateError.message}`);
      }

      console.log('Text extraction completed successfully for file:', fileId);

      // Now perform language detection
      await performLanguageDetection(supabase, fileId, extractedText);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Text extraction and language detection completed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (error) {
      throw error;
    }

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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
