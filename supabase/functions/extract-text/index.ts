
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
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
    let extractedText = ''
    const blob = new Blob([await fileContent.arrayBuffer()])

    if (fileData.mime_type === 'text/plain') {
      extractedText = await blob.text()
    } else if (fileData.mime_type === 'text/csv') {
      extractedText = await blob.text()
    } else if (
      fileData.mime_type === 'application/pdf' ||
      fileData.mime_type === 'application/msword' ||
      fileData.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // For PDF/DOC/DOCX we'll use a text extraction service
      // This is a placeholder - we'll implement the actual extraction in the next step
      extractedText = await blob.text()
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
      .eq('id', fileId)

    if (updateError) {
      throw new Error(`Failed to update file with extracted text: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Text extraction completed' }),
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
