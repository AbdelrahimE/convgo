import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleSheetsConfig {
  id: string;
  user_id: string;
  google_sheet_id: string;
  sheet_name: string;
  google_tokens: {
    access_token: string;
    refresh_token?: string;
    expires_at: string;
  };
  google_email: string;
}

interface DataField {
  field_name: string;
  field_display_name: string;
  field_order: number;
  column_letter?: string;
}

interface CollectedDataSession {
  id: string;
  config_id: string;
  conversation_id: string;
  phone_number: string;
  collected_data: Record<string, any>;
  is_complete: boolean;
  exported_to_sheets: boolean;
}

async function getAccessToken(
  supabase: any,
  config: GoogleSheetsConfig
): Promise<string> {
  // Check if current token is still valid
  const expiresAt = new Date(config.google_tokens.expires_at);
  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    // Token is still valid for at least 5 minutes
    return atob(config.google_tokens.access_token);
  }

  // Need to refresh the token
  if (!config.google_tokens.refresh_token) {
    throw new Error('No refresh token available');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Call the google-auth function to refresh the token
  const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/google-auth`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'refresh',
      config_id: config.id
    }),
  });

  if (!refreshResponse.ok) {
    throw new Error('Failed to refresh Google access token');
  }

  const refreshData = await refreshResponse.json();
  return refreshData.access_token;
}

async function getSheetHeaders(
  accessToken: string,
  sheetId: string,
  sheetName: string
): Promise<string[]> {
  const range = `${sheetName}!1:1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to get sheet headers:', error);
    return [];
  }

  const data = await response.json();
  return data.values?.[0] || [];
}

async function createSheetHeaders(
  accessToken: string,
  sheetId: string,
  sheetName: string,
  fields: DataField[]
): Promise<void> {
  const headers = fields
    .sort((a, b) => a.field_order - b.field_order)
    .map(field => field.field_display_name);
  
  // Add metadata columns
  headers.unshift('Timestamp', 'Phone Number', 'Conversation ID');
  
  const range = `${sheetName}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [headers],
      valueInputOption: 'USER_ENTERED',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create headers: ${error}`);
  }
}

async function appendDataToSheet(
  accessToken: string,
  sheetId: string,
  sheetName: string,
  session: CollectedDataSession,
  fields: DataField[]
): Promise<number> {
  // Prepare the data row
  const sortedFields = fields.sort((a, b) => a.field_order - b.field_order);
  
  const row = [
    new Date().toISOString(),
    session.phone_number,
    session.conversation_id,
    ...sortedFields.map(field => {
      const value = session.collected_data[field.field_name];
      return value !== undefined && value !== null ? value : '';
    })
  ];

  const range = `${sheetName}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [row],
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      includeValuesInResponse: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to append data: ${error}`);
  }

  const result = await response.json();
  
  // Extract row number from the updated range
  const updatedRange = result.updates?.updatedRange;
  if (updatedRange) {
    const match = updatedRange.match(/:(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return 0;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    const { sessionId, configId, exportAll = false } = await req.json();

    let sessions: CollectedDataSession[] = [];
    let config: GoogleSheetsConfig | null = null;

    if (sessionId) {
      // Export single session
      const { data: session, error: sessionError } = await supabase
        .from('collected_data_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Session not found');
      }

      if (!session.is_complete) {
        throw new Error('Session is not complete');
      }

      sessions = [session];
      
      // Get config from session
      const { data: configData, error: configError } = await supabase
        .from('google_sheets_config')
        .select('*')
        .eq('id', session.config_id)
        .single();

      if (configError || !configData) {
        throw new Error('Google Sheets configuration not found');
      }
      
      config = configData;
    } else if (configId && exportAll) {
      // Export all complete sessions
      const { data: configData, error: configError } = await supabase
        .from('google_sheets_config')
        .select('*')
        .eq('id', configId)
        .single();

      if (configError || !configData) {
        throw new Error('Google Sheets configuration not found');
      }
      
      config = configData;

      const { data: completeSessions, error: sessionsError } = await supabase
        .from('collected_data_sessions')
        .select('*')
        .eq('config_id', configId)
        .eq('is_complete', true)
        .eq('exported_to_sheets', false);

      if (sessionsError) {
        throw sessionsError;
      }

      sessions = completeSessions || [];
    } else {
      throw new Error('Invalid request parameters');
    }

    if (sessions.length === 0) {
      return new Response(
        JSON.stringify({ 
          exported: 0,
          message: 'No sessions to export' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    if (!config || !config.google_sheet_id) {
      throw new Error('Google Sheet ID not configured');
    }

    // Get data collection fields
    const { data: fields, error: fieldsError } = await supabase
      .from('data_collection_fields')
      .select('field_name, field_display_name, field_order, column_letter')
      .eq('config_id', config.id)
      .eq('is_active', true)
      .order('field_order');

    if (fieldsError || !fields || fields.length === 0) {
      throw new Error('No fields configured');
    }

    // Get Google access token
    const accessToken = await getAccessToken(supabase, config);

    // Check if sheet has headers
    const headers = await getSheetHeaders(accessToken, config.google_sheet_id, config.sheet_name);
    
    if (headers.length === 0) {
      // Create headers if they don't exist
      console.log('Creating sheet headers...');
      await createSheetHeaders(accessToken, config.google_sheet_id, config.sheet_name, fields);
    }

    // Export each session
    const exportResults = [];
    for (const session of sessions) {
      try {
        const rowNumber = await appendDataToSheet(
          accessToken,
          config.google_sheet_id,
          config.sheet_name,
          session,
          fields
        );

        // Update session as exported
        const { error: updateError } = await supabase
          .from('collected_data_sessions')
          .update({
            exported_to_sheets: true,
            sheet_row_number: rowNumber,
            exported_at: new Date().toISOString()
          })
          .eq('id', session.id);

        if (updateError) {
          console.error('Failed to update session:', updateError);
        }

        // Log export
        const { error: logError } = await supabase
          .from('sheets_export_logs')
          .insert({
            session_id: session.id,
            config_id: config.id,
            sheet_id: config.google_sheet_id,
            row_number: rowNumber,
            exported_data: session.collected_data,
            status: 'success'
          });

        if (logError) {
          console.error('Failed to log export:', logError);
        }

        exportResults.push({
          session_id: session.id,
          row_number: rowNumber,
          status: 'success'
        });
      } catch (error) {
        console.error(`Failed to export session ${session.id}:`, error);
        
        // Log failed export
        await supabase
          .from('sheets_export_logs')
          .insert({
            session_id: session.id,
            config_id: config.id,
            sheet_id: config.google_sheet_id,
            exported_data: session.collected_data,
            status: 'failed',
            error_message: error.message
          });

        // Update retry count
        await supabase
          .from('collected_data_sessions')
          .update({
            retry_count: session.retry_count + 1,
            export_error: error.message
          })
          .eq('id', session.id);

        exportResults.push({
          session_id: session.id,
          status: 'failed',
          error: error.message
        });
      }
    }

    const successCount = exportResults.filter(r => r.status === 'success').length;

    return new Response(
      JSON.stringify({
        exported: successCount,
        total: sessions.length,
        results: exportResults,
        sheet_id: config.google_sheet_id,
        sheet_url: `https://docs.google.com/spreadsheets/d/${config.google_sheet_id}`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in sheets-exporter function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});