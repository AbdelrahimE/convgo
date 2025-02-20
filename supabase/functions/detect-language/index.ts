
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { detect } from "https://esm.sh/@szamotulas/whatlang@0.0.3"

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

    // Detect language
    const result = detect(text)
    const detectedLanguage = result?.lang.code ?? 'und'
    const isReliable = result?.isReliable ?? false
    const direction = ['ar', 'fa', 'he', 'ur'].includes(detectedLanguage) ? 'rtl' : 'ltr'

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
          confidence: isReliable ? 'high' : 'low',
          script: result?.script?.code ?? 'unknown'
        }
      })
      .select()
      .single()

    if (chunkError) {
      throw chunkError
    }

    // Update file's detected languages
    const { data: fileData, error: fileError } = await supabaseClient
      .from('files')
      .select('detected_languages, primary_language')
      .eq('id', fileId)
      .single()

    if (fileError) {
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
      throw updateError
    }

    return new Response(
      JSON.stringify({
        chunk: chunkData,
        language: detectedLanguage,
        direction,
        isReliable
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
