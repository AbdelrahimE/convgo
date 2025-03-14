
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Create a Supabase client with the service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Simplified function to extract content from request
async function extractRequestContent(req: Request): Promise<{ parsedData: any, contentType: string, rawContent: string }> {
  // Get the content type for logging
  const contentType = req.headers.get('content-type') || 'unknown';
  let rawContent = '';
  
  try {
    // Clone the request to ensure we don't read the body multiple times
    const reqClone = req.clone();
    
    // Try to get the raw content as text first
    try {
      rawContent = await reqClone.text();
      console.log('Raw request content:', rawContent.substring(0, 1000));
    } catch (error) {
      console.error('Failed to read raw request content:', error);
    }
    
    // First, try to parse as JSON regardless of content type
    try {
      // If rawContent was already retrieved, use it
      if (rawContent) {
        return { 
          parsedData: JSON.parse(rawContent), 
          contentType, 
          rawContent 
        };
      }
      
      // Otherwise, get JSON directly
      const jsonData = await req.json();
      return { 
        parsedData: jsonData, 
        contentType, 
        rawContent: JSON.stringify(jsonData) 
      };
    } catch (jsonError) {
      console.log('Not valid JSON, trying other formats');
    }
    
    // Try to parse as form data
    if (contentType.includes('form')) {
      try {
        const formData = await req.formData();
        const formObj = Object.fromEntries(formData.entries());
        return { 
          parsedData: formObj, 
          contentType, 
          rawContent: rawContent || JSON.stringify(formObj) 
        };
      } catch (formError) {
        console.log('Not valid form data');
      }
    }
    
    // If we have raw content but couldn't parse it as JSON, try more permissive parsing
    if (rawContent) {
      try {
        // Try to detect JSON-like structure even with malformed JSON
        // This works for cases where the JSON might have comments or trailing commas
        const repaired = rawContent
          .replace(/[\r\n\t]/g, ' ')     // Replace whitespace
          .replace(/,\s*}/g, '}')       // Remove trailing commas in objects
          .replace(/,\s*\]/g, ']')      // Remove trailing commas in arrays
          .trim();
          
        // Attempt to parse the repaired JSON
        return { 
          parsedData: JSON.parse(repaired), 
          contentType, 
          rawContent 
        };
      } catch (fixError) {
        console.log('Could not repair malformed JSON');
      }
      
      // Last resort: try to extract a JSON object using regex
      try {
        const jsonMatch = rawContent.match(/({[\s\S]*}|\[[\s\S]*\])/);
        if (jsonMatch && jsonMatch[0]) {
          return { 
            parsedData: JSON.parse(jsonMatch[0]), 
            contentType, 
            rawContent 
          };
        }
      } catch (regexError) {
        console.log('Regex extraction failed');
      }
    }
    
    // If all parsing methods failed, return the raw content
    return { 
      parsedData: { raw: rawContent }, 
      contentType, 
      rawContent 
    };
  } catch (error) {
    console.error('Error extracting content from request:', error);
    return { 
      parsedData: { error: 'Failed to parse request' }, 
      contentType, 
      rawContent 
    };
  }
}

// Function to normalize event data regardless of format
function normalizeEventData(data: any): { 
  event: string; 
  instance: string; 
  data: any;
} {
  try {
    console.log('Normalizing data:', JSON.stringify(data).substring(0, 500));
    
    // Check if this is already in our expected format
    if (data.event && data.instance && data.data) {
      console.log('Data already in expected format');
      return data;
    }
    
    // EVOLUTION API's format
    // Check for EVOLUTION API webhook format (based on your webhook.site capture)
    if (data.body?.key?.remoteJid || data.key?.remoteJid) {
      // This appears to be EVOLUTION's direct format
      const messageObj = data.body || data;
      const instanceName = data.instance || data.instance_name || 'unknown-instance';
      
      console.log('Detected EVOLUTION API format, instance:', instanceName);
      
      // Construct normalized event data
      return {
        event: 'messages.upsert',
        instance: instanceName,
        data: messageObj
      };
    }
    
    // Handle other potential formats or return something reasonable
    const result = {
      event: data.type || data.event || 'unknown',
      instance: data.instance || data.instanceName || 'unknown-instance',
      data: data
    };
    
    console.log('Using fallback format:', JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error('Error normalizing event data:', error);
    return {
      event: 'error',
      instance: 'parsing-error',
      data: { error: 'Failed to normalize event data', originalData: data }
    };
  }
}

// Main webhook handler
async function handleWebhook(req: Request): Promise<Response> {
  try {
    console.log('⭐ WEBHOOK REQUEST RECEIVED ⭐');
    
    // Extract content from the request using our robust extraction function
    const { parsedData, contentType, rawContent } = await extractRequestContent(req);
    
    console.log(`Processing webhook with content-type: ${contentType}`);
    console.log('📨 Incoming webhook data:', JSON.stringify(parsedData).substring(0, 500));
    
    // For test requests, handle differently
    if (req.method === 'POST' && parsedData.action === 'test') {
      return handleTestRequest(parsedData);
    }
    
    // For status check requests
    if (req.method === 'POST' && parsedData.action === 'status') {
      return handleStatusRequest();
    }
    
    // Normalize the event data to a consistent format
    const normalizedEvent = normalizeEventData(parsedData);
    console.log('✅ Normalized event:', JSON.stringify(normalizedEvent).substring(0, 500));
    
    // Additional validation before insert
    if (!normalizedEvent.event || !normalizedEvent.instance) {
      console.error('❌ Invalid normalized event - missing required fields:', JSON.stringify(normalizedEvent));
      await logWebhookError('Invalid normalized event - missing required fields', rawContent, contentType, normalizedEvent);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Invalid webhook data' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Store in database
    console.log('💾 Attempting to insert webhook message into database...');
    
    try {
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('webhook_messages')
        .insert({
          event: normalizedEvent.event,
          instance: normalizedEvent.instance,
          data: normalizedEvent.data
        });
      
      if (insertError) {
        console.error('❌ Database insertion error:', insertError);
        await logWebhookError(insertError.message, rawContent, contentType, normalizedEvent);
        
        // Even if we failed to store it, return 200 to avoid EVOLUTION API retries
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Failed to process webhook, but received' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('✅ Successfully processed and stored webhook message');
      
      // Return success response - ALWAYS return 200 to prevent retries
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook received and processed successfully' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (dbError) {
      console.error('❌ Unexpected database error:', dbError);
      await logWebhookError(dbError instanceof Error ? dbError.message : 'Unknown database error', 
                           rawContent, contentType, normalizedEvent);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Database error, but request received' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('❌ Unexpected error in webhook handler:', error);
    
    try {
      await logWebhookError(error instanceof Error ? error.message : 'Unknown error', 
                           'Failed to extract content', 'unknown', null);
    } catch (logError) {
      console.error('❌ Failed to log webhook error:', logError);
    }
    
    // Return 200 even for errors to prevent retries
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error processing webhook, but request received' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Helper function to log errors for debugging
async function logWebhookError(errorMessage: string, rawContent: string, contentType: string, normalizedData: any): Promise<void> {
  try {
    await supabaseAdmin
      .from('webhook_errors')
      .insert({
        error_message: errorMessage,
        raw_content: rawContent,
        content_type: contentType,
        normalized_data: normalizedData,
        created_at: new Date().toISOString()
      });
    
    console.log('✅ Webhook error logged to database');
  } catch (error) {
    console.error('❌ Failed to log webhook error to database:', error);
  }
}

// Handle test requests
async function handleTestRequest(data: any): Promise<Response> {
  try {
    console.log('Processing test request:', JSON.stringify(data));
    
    // Extract instance name and test data
    const { instanceName, testData } = data;
    
    if (!instanceName) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing instanceName parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // If test data is provided, store a test message
    if (testData) {
      // Store test message in database
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('webhook_messages')
        .insert({
          event: testData.event || 'test',
          instance: instanceName,
          data: testData.data || { message: 'Test message' }
        });
      
      if (insertError) {
        console.error('Error inserting test message:', insertError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Failed to store test message',
            details: insertError.message
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Test message stored successfully');
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test webhook processed successfully',
        details: { instanceName }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing test request:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error processing test request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Handle status check requests
async function handleStatusRequest(): Promise<Response> {
  try {
    // Check webhook configurations
    const { data: webhookConfigs, error: configError } = await supabaseAdmin
      .from('whatsapp_webhook_config')
      .select('*');
    
    if (configError) {
      console.error('Error fetching webhook configurations:', configError);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to retrieve webhook configurations',
          details: configError.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook status checked successfully',
        activeWebhooks: webhookConfigs
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking webhook status:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Error checking webhook status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Main handler function
serve(async (req) => {
  console.log(`🔔 Webhook request received: ${req.method} ${new URL(req.url).pathname}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }
  
  // Process the webhook - note we're not checking for auth headers
  return handleWebhook(req);
});
