
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { franc } from "https://esm.sh/franc@6.1.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileId, text, chunkOrder } = await req.json()
    
    if (!text) {
      throw new Error('No text provided')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Detect language using franc
    const detectedLanguage = franc(text) || 'und'
    const direction = ['ara', 'fas', 'heb', 'urd'].includes(detectedLanguage) ? 'rtl' : 'ltr'

    console.log('Language detection result:', {
      text: text.substring(0, 100) + '...', // Log first 100 chars for debugging
      detectedLanguage,
      direction
    })

    // Store chunk with language metadata
    const { data: chunkData, error: chunkError } = await supabaseClient
      .from('text_chunks')
      .insert({
        file_id: fileId,
        content: text,
        chunk_order: chunkOrder,
        language: detectedLanguage,
        direction,
        metadata: {
          confidence: 'high', // Franc has good accuracy for text > 10 characters
          script: 'auto'
        }
      })
      .select()
      .single()

    if (chunkError) {
      console.error('Error storing chunk:', chunkError)
      throw chunkError
    }

    // Update file's detected languages
    const { data: fileData, error: fileError } = await supabaseClient
      .from('files')
      .select('detected_languages, primary_language')
      .eq('id', fileId)
      .single()

    if (fileError) {
      console.error('Error fetching file data:', fileError)
      throw fileError
    }

    const existingLanguages = fileData.detected_languages || []
    const updatedLanguages = [...new Set([...existingLanguages, detectedLanguage])]
    
    // If no primary language is set, use the first detected language
    const primaryLanguage = fileData.primary_language || detectedLanguage

    const { error: updateError } = await supabaseClient
      .from('files')
      .update({
        detected_languages: updatedLanguages,
        primary_language: primaryLanguage,
        text_direction: direction
      })
      .eq('id', fileId)

    if (updateError) {
      console.error('Error updating file:', updateError)
      throw updateError
    }

    return new Response(
      JSON.stringify({
        chunk: chunkData,
        language: detectedLanguage,
        direction,
        isReliable: true
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Language detection error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
