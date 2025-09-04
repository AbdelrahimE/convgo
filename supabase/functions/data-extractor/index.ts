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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

    if (!openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    const { 
      whatsapp_instance_id,
      conversation_id,
      phone_number,
      message_text,
      conversation_history = []
    } = await req.json();

    console.log('Extracting data for conversation:', conversation_id);

    // Get WhatsApp AI config with data collection settings
    const { data: aiConfig, error: aiConfigError } = await supabase
      .from('whatsapp_ai_config')
      .select('enable_data_collection, data_collection_config_id')
      .eq('whatsapp_instance_id', whatsapp_instance_id)
      .single();

    if (aiConfigError || !aiConfig?.enable_data_collection || !aiConfig.data_collection_config_id) {
      console.log('Data collection not enabled for this instance');
      return new Response(
        JSON.stringify({ 
          extracted: false,
          reason: 'Data collection not enabled' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    const configId = aiConfig.data_collection_config_id;

    // Get data collection fields configuration
    const { data: fields, error: fieldsError } = await supabase
      .from('data_collection_fields')
      .select('*')
      .eq('config_id', configId)
      .eq('is_active', true)
      .order('field_order');

    if (fieldsError || !fields || fields.length === 0) {
      console.log('No fields configured for data collection');
      return new Response(
        JSON.stringify({ 
          extracted: false,
          reason: 'No fields configured' 
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
    if (session.is_complete && session.exported_to_sheets) {
      console.log('Session already complete and exported');
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

    // Build extraction prompt
    const fieldsDescription = fields.map((field: DataField) => {
      const keywords = field.extraction_keywords?.join(', ') || '';
      return `- "${field.field_name}": ${field.field_display_name} (${field.field_type})${field.is_required ? ' [REQUIRED]' : ''}${keywords ? ` - Keywords: ${keywords}` : ''}${field.prompt_template ? ` - ${field.prompt_template}` : ''}`;
    }).join('\n');

    const systemPrompt = `You are a data extraction assistant for a WhatsApp business conversation.
Extract the following fields from the customer's message and conversation history.
Return ONLY a valid JSON object with the extracted data.

Fields to extract:
${fieldsDescription}

Rules:
1. Extract only the fields mentioned above
2. Use field_name as the key in the JSON response
3. If a field cannot be extracted from the message, omit it from the response
4. For phone numbers, extract and format them properly
5. For emails, validate the format
6. For dates, use ISO format (YYYY-MM-DD)
7. For boolean fields, use true/false
8. Consider the conversation history for context
9. If the customer provides multiple values for a field, use the most recent one

Current collected data:
${JSON.stringify(session.collected_data)}

Return only the JSON object with newly extracted or updated fields.`;

    const userPrompt = `Current message: "${message_text}"

Conversation history:
${conversation_history.map((msg: any) => `${msg.from}: ${msg.message}`).join('\n')}`;

    // Call OpenAI to extract data
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
    const extractedData = JSON.parse(aiResult.choices[0].message.content);

    console.log('Extracted data:', extractedData);

    // Merge with existing collected data
    const updatedData = {
      ...session.collected_data,
      ...extractedData
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
      .filter(field => field.is_required && !validatedData[field.field_name])
      .map(field => field.field_name);

    const isComplete = missingFields.length === 0;

    // Update session
    const { error: updateError } = await supabase
      .from('collected_data_sessions')
      .update({
        collected_data: validatedData,
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
    if (isComplete) {
      console.log('Data collection complete, triggering export to Google Sheets');
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

      if (exportResponse.ok) {
        exportStatus = await exportResponse.json();
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
        export_status: exportStatus
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