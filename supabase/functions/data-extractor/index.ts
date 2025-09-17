import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DataField {
  id: string;
  field_name: string;
  field_display_name: string;
  field_display_name_ar?: string;
  field_type: string;
  is_required: boolean;
  validation_rules?: any;
  extraction_keywords?: string[];
  prompt_template?: string;
  ask_if_missing_template?: string;
}

interface CollectedDataSession {
  id: string;
  config_id: string;
  conversation_id: string;
  phone_number: string;
  collected_data: Record<string, any>;
  missing_fields: string[];
  is_complete: boolean;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('🚀 DATA-EXTRACTOR: Function called');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

    console.log('🔧 DATA-EXTRACTOR: Environment check', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseServiceRoleKey,
      hasOpenAI: !!openaiKey,
      supabaseUrl: supabaseUrl?.substring(0, 30) + '...'
    });

    if (!openaiKey) {
      console.error('❌ DATA-EXTRACTOR: OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    console.log('📥 DATA-EXTRACTOR: Parsing request body');
    const requestBody = await req.json();
    
    const { 
      whatsapp_instance_id,
      conversation_id,
      phone_number,
      message_text,
      conversation_history = []
    } = requestBody;

    console.log('📊 DATA-EXTRACTOR: Request data received', {
      whatsapp_instance_id,
      conversation_id,
      phone_number,
      message_text: message_text?.substring(0, 100),
      conversation_history_length: conversation_history?.length,
      fullRequestBody: requestBody
    });

    // Get WhatsApp AI config with data collection settings
    console.log('🔍 DATA-EXTRACTOR: Querying AI config', {
      table: 'whatsapp_ai_config',
      whatsapp_instance_id
    });

    const { data: aiConfig, error: aiConfigError } = await supabase
      .from('whatsapp_ai_config')
      .select('enable_data_collection, data_collection_config_id, whatsapp_instance_id')
      .eq('whatsapp_instance_id', whatsapp_instance_id)
      .single();

    console.log('📊 DATA-EXTRACTOR: AI config query result', {
      hasData: !!aiConfig,
      aiConfig,
      error: aiConfigError?.message,
      errorCode: aiConfigError?.code,
      errorDetails: aiConfigError?.details
    });

    if (aiConfigError || !aiConfig?.enable_data_collection || !aiConfig.data_collection_config_id) {
      console.log('⚠️ DATA-EXTRACTOR: Data collection not enabled', {
        hasError: !!aiConfigError,
        enable_data_collection: aiConfig?.enable_data_collection,
        data_collection_config_id: aiConfig?.data_collection_config_id,
        reason: aiConfigError ? 'query_error' : !aiConfig?.enable_data_collection ? 'not_enabled' : 'no_config_id'
      });
      
      return new Response(
        JSON.stringify({ 
          extracted: false,
          reason: 'Data collection not enabled',
          details: {
            error: aiConfigError?.message,
            enable_data_collection: aiConfig?.enable_data_collection,
            has_config_id: !!aiConfig?.data_collection_config_id
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    const configId = aiConfig.data_collection_config_id;
    console.log('✅ DATA-EXTRACTOR: Using config ID', { configId });

    // Get data collection fields configuration
    console.log('🔍 DATA-EXTRACTOR: Querying fields configuration', {
      table: 'data_collection_fields',
      configId,
      query: 'config_id = ' + configId + ' AND is_active = true'
    });

    const { data: fields, error: fieldsError } = await supabase
      .from('data_collection_fields')
      .select('*')
      .eq('config_id', configId)
      .eq('is_active', true)
      .order('field_order');

    console.log('📊 DATA-EXTRACTOR: Fields query result', {
      hasFields: !!fields,
      fieldsCount: fields?.length || 0,
      fieldsError: fieldsError?.message,
      fields: fields?.map(f => ({ 
        field_name: f.field_name,
        field_display_name: f.field_display_name,
        is_required: f.is_required,
        keywords: f.extraction_keywords
      }))
    });

    if (fieldsError || !fields || fields.length === 0) {
      console.log('⚠️ DATA-EXTRACTOR: No fields configured', {
        error: fieldsError?.message,
        hasFields: !!fields,
        fieldsLength: fields?.length
      });
      
      return new Response(
        JSON.stringify({ 
          extracted: false,
          reason: 'No fields configured',
          details: {
            error: fieldsError?.message,
            config_id: configId,
            fields_found: fields?.length || 0
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Get or create data collection session
    let { data: session, error: sessionError } = await supabase
      .from('collected_data_sessions')
      .select('*')
      .eq('config_id', configId)
      .eq('conversation_id', conversation_id)
      .single();

    if (sessionError && sessionError.code === 'PGRST116') {
      // Create new session
      const { data: newSession, error: createError } = await supabase
        .from('collected_data_sessions')
        .insert({
          config_id: configId,
          conversation_id,
          phone_number,
          collected_data: {},
          missing_fields: fields.filter((f: DataField) => f.is_required).map((f: DataField) => f.field_name),
          is_complete: false
        })
        .select()
        .single();

      if (createError) throw createError;
      session = newSession;
    } else if (sessionError) {
      throw sessionError;
    }

    // If session is already complete, no need to extract more data
    if (session.is_complete) {
      console.log('Session already complete, skipping data extraction');
      return new Response(
        JSON.stringify({ 
          extracted: false,
          reason: 'Session already complete' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Build extraction prompt using display names for better AI understanding
    const fieldsDescription = fields.map((field: DataField) => {
      const keywords = field.extraction_keywords?.join(', ') || '';
      const displayName = field.field_display_name_ar || field.field_display_name;
      return `- "${displayName}": ${field.field_display_name} (${field.field_type})${field.is_required ? ' [REQUIRED]' : ''}${keywords ? ` - Keywords: ${keywords}` : ''}${field.prompt_template ? ` - ${field.prompt_template}` : ''}`;
    }).join('\n');

    const systemPrompt = `You are a data extraction assistant for a WhatsApp business conversation.
Extract the following fields from the customer's message and conversation history.
Return ONLY a valid JSON object with the extracted data.

Fields to extract:
${fieldsDescription}

EXTRACTION RULES:
1. Extract only the fields mentioned above
2. Use the exact field display name (Arabic name if available, otherwise English) as the key in the JSON response
3. If a field cannot be extracted from the message, omit it from the response
4. For phone numbers, extract and format them properly (remove spaces, dashes, parentheses)
5. For emails, validate the format
6. For dates, use ISO format (YYYY-MM-DD)
7. For boolean fields, use true/false
8. Consider the conversation history for context
9. If the customer provides multiple values for a field, use the most recent one

LANGUAGE SUPPORT:
- Support Arabic names and text (عبدالرحيم, محمد, فاطمة, etc.)
- Support mixed Arabic-English content
- Extract phone numbers in any format (01012345678, +201012345678, 0101 234 5678)
- Look for names after common Arabic patterns like "اسمي" or "انا" or when directly asked for name

DETECTION PATTERNS:
- Names: Look for Arabic or English names in responses to name requests
- Phone: Look for sequences of 10-11 digits, with or without country code
- Direct responses: When user directly answers a question about a specific field

Current collected data:
${JSON.stringify(session.collected_data)}

EXAMPLES:
- Message: "عبدالرحيم" → {"الاسم": "عبدالرحيم"}  
- Message: "01012345678" → {"رقم الهاتف": "01012345678"}
- Message: "اسمي محمد ورقمي 01123456789" → {"الاسم": "محمد", "رقم الهاتف": "01123456789"}

Return only the JSON object with newly extracted or updated fields.`;

    const userPrompt = `Current message: "${message_text}"

Conversation history:
${conversation_history.map((msg: any) => `${msg.from}: ${msg.message}`).join('\n')}`;

    console.log('🤖 DATA-EXTRACTOR: Prepared prompts for OpenAI', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      messageText: message_text,
      conversationHistoryLength: conversation_history?.length,
      fieldsToExtract: fields?.map(f => f.field_name),
      sessionData: session.collected_data,
      systemPromptPreview: systemPrompt.substring(0, 200) + '...',
      userPromptPreview: userPrompt.substring(0, 200) + '...'
    });

    // Call OpenAI to extract data
    console.log('🔄 DATA-EXTRACTOR: Calling OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 500
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      throw new Error('Failed to extract data');
    }

    const aiResult = await openaiResponse.json();
    
    console.log('📥 DATA-EXTRACTOR: OpenAI API response received', {
      status: 'success',
      choices: aiResult.choices?.length,
      usage: aiResult.usage,
      model: aiResult.model,
      rawResponse: JSON.stringify(aiResult)
    });

    const rawContent = aiResult.choices[0].message.content;
    console.log('🔍 DATA-EXTRACTOR: Raw AI response content', {
      rawContent: rawContent,
      contentLength: rawContent?.length,
      startsWithBrace: rawContent?.trim()?.startsWith('{'),
      endsWithBrace: rawContent?.trim()?.endsWith('}')
    });

    let extractedData;
    try {
      extractedData = JSON.parse(rawContent);
      console.log('✅ DATA-EXTRACTOR: Successfully parsed AI response', {
        extractedData: extractedData,
        dataKeys: Object.keys(extractedData || {}),
        dataCount: Object.keys(extractedData || {}).length
      });
    } catch (parseError) {
      console.error('❌ DATA-EXTRACTOR: Failed to parse AI response as JSON', {
        rawContent: rawContent,
        parseError: parseError.message
      });
      extractedData = {};
    }

    console.log('📊 DATA-EXTRACTOR: Final extracted data:', extractedData);

    // Map display names to field names
    const mappedData: Record<string, any> = {};
    for (const [displayKey, value] of Object.entries(extractedData || {})) {
      // Find the field that matches this display name
      const matchingField = fields.find((field: DataField) => {
        const primaryDisplayName = field.field_display_name_ar || field.field_display_name;
        const secondaryDisplayName = field.field_display_name;
        return primaryDisplayName === displayKey || secondaryDisplayName === displayKey;
      });

      if (matchingField) {
        mappedData[matchingField.field_name] = value;
        console.log(`📝 DATA-EXTRACTOR: Mapped "${displayKey}" → "${matchingField.field_name}"`);
      } else {
        console.warn(`⚠️ DATA-EXTRACTOR: No field found for display name "${displayKey}"`);
      }
    }

    console.log('🔄 DATA-EXTRACTOR: Mapped data to field names:', mappedData);

    // Merge with existing collected data
    const updatedData = {
      ...session.collected_data,
      ...mappedData
    };

    // Validate extracted data
    const validatedData: Record<string, any> = {};
    const validationErrors: Record<string, string> = {};

    for (const field of fields as DataField[]) {
      const value = updatedData[field.field_name];
      
      if (value !== undefined && value !== null && value !== '') {
        // Type validation
        let isValid = true;
        let validatedValue = value;

        switch (field.field_type) {
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            isValid = emailRegex.test(value);
            if (!isValid) validationErrors[field.field_name] = 'Invalid email format';
            break;
            
          case 'phone':
            // Basic phone validation - can be customized
            const phoneRegex = /^[\d\s\-\+\(\)]+$/;
            isValid = phoneRegex.test(value);
            if (!isValid) validationErrors[field.field_name] = 'Invalid phone format';
            break;
            
          case 'number':
            validatedValue = parseFloat(value);
            isValid = !isNaN(validatedValue);
            if (!isValid) validationErrors[field.field_name] = 'Must be a number';
            break;
            
          case 'boolean':
            validatedValue = ['true', '1', 'yes', 'نعم', 'اه', 'ايوة'].includes(value.toString().toLowerCase());
            break;
            
          case 'date':
            // Try to parse date
            const dateValue = new Date(value);
            isValid = !isNaN(dateValue.getTime());
            if (isValid) {
              validatedValue = dateValue.toISOString().split('T')[0];
            } else {
              validationErrors[field.field_name] = 'Invalid date format';
            }
            break;
        }

        // Custom validation rules
        if (isValid && field.validation_rules) {
          if (field.validation_rules.regex) {
            const regex = new RegExp(field.validation_rules.regex);
            if (!regex.test(validatedValue)) {
              isValid = false;
              validationErrors[field.field_name] = field.validation_rules.error_message || 'Validation failed';
            }
          }
        }

        if (isValid) {
          validatedData[field.field_name] = validatedValue;
        }
      }
    }

    // Calculate missing required fields
    const missingFields = (fields as DataField[])
      .filter(field => field.is_required && !updatedData[field.field_name])
      .map(field => field.field_name);

    const isComplete = missingFields.length === 0;

    // Update session
    const { error: updateError } = await supabase
      .from('collected_data_sessions')
      .update({
        collected_data: updatedData,
        missing_fields: missingFields,
        validation_errors: Object.keys(validationErrors).length > 0 ? validationErrors : null,
        is_complete: isComplete,
        last_message_at: new Date().toISOString(),
        completed_at: isComplete ? new Date().toISOString() : null
      })
      .eq('id', session.id);

    if (updateError) throw updateError;

    // Generate response for missing fields
    let responseMessage = null;
    if (!isComplete && missingFields.length > 0) {
      const missingFieldsData = (fields as DataField[])
        .filter(field => missingFields.includes(field.field_name));

      const firstMissingField = missingFieldsData[0];
      if (firstMissingField.ask_if_missing_template) {
        responseMessage = firstMissingField.ask_if_missing_template;
      } else {
        responseMessage = `لو سمحت، هل يمكنك إخباري بـ ${firstMissingField.field_display_name_ar || firstMissingField.field_display_name}؟`;
      }
    }

    // If complete, trigger export to Google Sheets
    let exportStatus = null;
    let exportError = null;
    if (isComplete) {
      console.log('📊 DATA-EXTRACTOR: Data collection complete, triggering export to Google Sheets', {
        sessionId: session.id,
        configId: configId
      });
      
      try {
        // Call the sheets-exporter function
        const exportResponse = await fetch(`${supabaseUrl}/functions/v1/sheets-exporter`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: session.id
          }),
        });

        console.log('📡 DATA-EXTRACTOR: Export response received', {
          status: exportResponse.status,
          statusText: exportResponse.statusText,
          ok: exportResponse.ok
        });

        if (exportResponse.ok) {
          exportStatus = await exportResponse.json();
          console.log('✅ DATA-EXTRACTOR: Export successful', { exportStatus });
        } else {
          // Parse error response for better handling
          const errorResponse = await exportResponse.json();
          console.error('❌ DATA-EXTRACTOR: Export failed', {
            status: exportResponse.status,
            errorResponse
          });
          
          exportError = {
            failed: true,
            status: exportResponse.status,
            message: errorResponse.error || 'Export failed',
            user_message: errorResponse.user_message || 'Failed to export data to Google Sheets. Please try again later.',
            error_type: errorResponse.error_type || 'unknown_error',
            needs_reconnect: errorResponse.needs_reconnect || false,
            error_code: errorResponse.error_code,
            reconnect_url: errorResponse.reconnect_url
          };
        }
      } catch (fetchError) {
        console.error('💥 DATA-EXTRACTOR: Exception during export call', {
          error: fetchError.message,
          stack: fetchError.stack,
          sessionId: session.id
        });
        
        exportError = {
          failed: true,
          message: fetchError.message,
          user_message: 'Unable to connect to export service. Please try again later.',
          error_type: 'network_error',
          needs_reconnect: false
        };
      }
    }

    return new Response(
      JSON.stringify({
        extracted: true,
        session_id: session.id,
        collected_data: validatedData,
        missing_fields: missingFields,
        is_complete: isComplete,
        validation_errors: validationErrors,
        response_message: responseMessage,
        export_status: exportStatus,
        export_error: exportError
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in data-extractor function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        extracted: false
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});