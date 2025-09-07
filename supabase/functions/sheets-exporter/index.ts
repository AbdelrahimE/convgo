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
  console.log('🔐 TOKEN: Starting getAccessToken process', {
    configId: config.id,
    hasAccessToken: !!config.google_tokens?.access_token,
    hasRefreshToken: !!config.google_tokens?.refresh_token,
    expiresAt: config.google_tokens?.expires_at,
    currentTime: new Date().toISOString()
  });

  // Check if current token is still valid
  const expiresAt = new Date(config.google_tokens.expires_at);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  
  console.log('⏰ TOKEN: Checking token expiry', {
    expiresAt: expiresAt.toISOString(),
    fiveMinutesFromNow: fiveMinutesFromNow.toISOString(),
    isTokenValid: expiresAt > fiveMinutesFromNow,
    timeDifferenceMinutes: Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60))
  });

  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid for at least 5 minutes
    console.log('✅ TOKEN: Current token is still valid, using existing token');
    const decodedToken = atob(config.google_tokens.access_token);
    console.log('🔓 TOKEN: Successfully decoded existing access token', {
      tokenLength: decodedToken.length,
      tokenPreview: decodedToken.substring(0, 10) + '...'
    });
    return decodedToken;
  }

  console.log('🔄 TOKEN: Token expired, need to refresh');

  // Need to refresh the token
  if (!config.google_tokens.refresh_token) {
    console.error('❌ TOKEN: No refresh token available', {
      configId: config.id,
      tokenKeys: Object.keys(config.google_tokens || {})
    });
    throw new Error('No refresh token available');
  }

  console.log('🔧 TOKEN: Getting Google OAuth credentials from environment');
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

  console.log('🌐 TOKEN: Environment variables check', {
    hasGoogleClientId: !!googleClientId,
    hasGoogleClientSecret: !!googleClientSecret,
    googleClientIdLength: googleClientId.length,
    googleClientSecretLength: googleClientSecret.length
  });

  if (!googleClientId || !googleClientSecret) {
    console.error('❌ TOKEN: Missing Google OAuth credentials', {
      hasGoogleClientId: !!googleClientId,
      hasGoogleClientSecret: !!googleClientSecret
    });
    throw new Error('Google OAuth credentials not configured');
  }

  // Decode refresh token
  const refreshToken = atob(config.google_tokens.refresh_token);
  console.log('🔑 TOKEN: Decoded refresh token for Google API call', {
    refreshTokenLength: refreshToken.length,
    configId: config.id
  });

  // Make direct request to Google OAuth to refresh the token
  console.log('📤 TOKEN: Making direct request to Google OAuth API for token refresh');
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        grant_type: 'refresh_token',
      }),
    });

    console.log('📥 TOKEN: Received response from Google OAuth API', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      ok: tokenResponse.ok
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ TOKEN: Google OAuth API returned error', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorBody: errorText,
        configId: config.id
      });
      throw new Error(`Failed to refresh Google access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    const newTokens = await tokenResponse.json();
    console.log('✅ TOKEN: Successfully received new tokens from Google', {
      hasAccessToken: !!newTokens.access_token,
      accessTokenLength: newTokens.access_token?.length,
      hasRefreshToken: !!newTokens.refresh_token,
      expiresIn: newTokens.expires_in,
      configId: config.id
    });

    // Prepare encrypted tokens for database update
    const encryptedTokens = {
      ...config.google_tokens,
      access_token: btoa(newTokens.access_token),
      expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    };

    // If Google provided a new refresh token, update it too
    if (newTokens.refresh_token) {
      encryptedTokens.refresh_token = btoa(newTokens.refresh_token);
    }

    console.log('💾 TOKEN: Updating database with new tokens', {
      configId: config.id,
      newExpiresAt: encryptedTokens.expires_at,
      hasNewRefreshToken: !!newTokens.refresh_token
    });

    // Update the database with new tokens
    const { error: updateError } = await supabase
      .from('google_sheets_config')
      .update({
        google_tokens: encryptedTokens,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);

    if (updateError) {
      console.error('❌ TOKEN: Failed to update database with new tokens', {
        error: updateError.message,
        errorCode: updateError.code,
        configId: config.id
      });
      throw new Error(`Failed to save refreshed token: ${updateError.message}`);
    }

    console.log('✅ TOKEN: Successfully updated database and returning new access token', {
      configId: config.id,
      accessTokenLength: newTokens.access_token.length
    });

    return newTokens.access_token;
  } catch (error) {
    console.error('💥 TOKEN: Exception during token refresh', {
      error: error.message,
      stack: error.stack,
      configId: config.id
    });
    throw error;
  }
}

async function getSheetHeaders(
  accessToken: string,
  sheetId: string,
  sheetName: string
): Promise<string[]> {
  console.log('📋 HEADERS: Starting getSheetHeaders', {
    sheetId,
    sheetName,
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken?.length
  });

  const range = `${sheetName}!1:1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  
  console.log('🌐 HEADERS: Making Google Sheets API request', {
    url,
    range,
    method: 'GET'
  });

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log('📥 HEADERS: Received response from Google Sheets API', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ HEADERS: Failed to get sheet headers', {
        status: response.status,
        statusText: response.statusText,
        errorBody: error,
        sheetId,
        sheetName
      });
      return [];
    }

    const data = await response.json();
    const headers = data.values?.[0] || [];
    
    console.log('✅ HEADERS: Successfully retrieved sheet headers', {
      headersCount: headers.length,
      headers: headers.slice(0, 5), // Show first 5 headers
      sheetId,
      sheetName
    });

    return headers;
  } catch (error) {
    console.error('💥 HEADERS: Exception getting sheet headers', {
      error: error.message,
      stack: error.stack,
      sheetId,
      sheetName
    });
    return [];
  }
}

async function createSheetHeaders(
  accessToken: string,
  sheetId: string,
  sheetName: string,
  fields: DataField[]
): Promise<void> {
  console.log('🏗️ CREATE_HEADERS: Starting createSheetHeaders', {
    sheetId,
    sheetName,
    fieldsCount: fields.length,
    fields: fields.map(f => ({ name: f.field_display_name, order: f.field_order }))
  });

  const headers = fields
    .sort((a, b) => a.field_order - b.field_order)
    .map(field => field.field_display_name);
  
  // Add metadata columns
  headers.unshift('Timestamp', 'Phone Number', 'Conversation ID');
  
  console.log('📝 CREATE_HEADERS: Prepared headers array', {
    headersCount: headers.length,
    headers
  });

  // Create proper range for headers (A1 to the last column needed)
  const lastColumn = String.fromCharCode(65 + headers.length - 1); // A=65, so A+n
  const range = `${sheetName}!A1:${lastColumn}1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  
  const requestBody = {
    majorDimension: 'ROWS',
    values: [headers]
  };

  // Add valueInputOption as query parameter
  const urlWithParams = `${url}?valueInputOption=USER_ENTERED`;

  console.log('🌐 CREATE_HEADERS: Making Google Sheets API request to create headers', {
    url: urlWithParams,
    method: 'PUT',
    range,
    requestBody,
    headersToCreate: headers
  });

  try {
    const response = await fetch(urlWithParams, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📥 CREATE_HEADERS: Received response from Google Sheets API', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ CREATE_HEADERS: Failed to create headers', {
        status: response.status,
        statusText: response.statusText,
        errorBody: error,
        sheetId,
        sheetName,
        range,
        requestBody,
        urlUsed: urlWithParams
      });
      throw new Error(`Failed to create headers: ${response.status} ${response.statusText} - ${error}`);
    }

    const responseData = await response.json();
    console.log('✅ CREATE_HEADERS: Successfully created sheet headers', {
      responseData,
      sheetId,
      sheetName,
      headersCreated: headers.length,
      range
    });
  } catch (error) {
    console.error('💥 CREATE_HEADERS: Exception creating sheet headers', {
      error: error.message,
      stack: error.stack,
      sheetId,
      sheetName,
      headers,
      range,
      url: urlWithParams
    });
    throw error;
  }
}

async function appendDataToSheet(
  accessToken: string,
  sheetId: string,
  sheetName: string,
  session: CollectedDataSession,
  fields: DataField[]
): Promise<number> {
  console.log('➕ APPEND: Starting appendDataToSheet', {
    sheetId,
    sheetName,
    sessionId: session.id,
    phoneNumber: session.phone_number,
    conversationId: session.conversation_id,
    fieldsCount: fields.length,
    collectedDataKeys: Object.keys(session.collected_data || {})
  });

  // Prepare the data row
  const sortedFields = fields.sort((a, b) => a.field_order - b.field_order);
  
  console.log('📊 APPEND: Sorted fields for data row', {
    sortedFields: sortedFields.map(f => ({ name: f.field_name, displayName: f.field_display_name, order: f.field_order }))
  });

  const row = [
    new Date().toISOString(),
    session.phone_number,
    session.conversation_id,
    ...sortedFields.map(field => {
      const value = session.collected_data[field.field_name];
      const finalValue = value !== undefined && value !== null ? value : '';
      console.log(`🔍 APPEND: Mapping field ${field.field_name}`, {
        fieldName: field.field_name,
        rawValue: value,
        finalValue,
        hasValue: value !== undefined && value !== null
      });
      return finalValue;
    })
  ];

  console.log('📝 APPEND: Prepared data row', {
    rowLength: row.length,
    row: row.map((val, idx) => `[${idx}]: ${val}`),
    sessionData: session.collected_data
  });

  const range = `${sheetName}!A:Z`;
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append`;
  
  // Move API parameters to query string as per Google Sheets API specification
  const url = `${baseUrl}?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  
  const requestBody = {
    majorDimension: 'ROWS',
    values: [row]
  };

  console.log('🌐 APPEND: Making Google Sheets API request to append data', {
    url,
    method: 'POST',
    range,
    requestBody
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📥 APPEND: Received response from Google Sheets API', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ APPEND: Failed to append data to sheet', {
        status: response.status,
        statusText: response.statusText,
        errorBody: error,
        sheetId,
        sheetName,
        sessionId: session.id,
        requestBody,
        urlUsed: url
      });
      throw new Error(`Failed to append data: ${response.status} ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    
    console.log('📊 APPEND: Google Sheets API response received', {
      result,
      hasUpdates: !!result.updates,
      updatedRange: result.updates?.updatedRange,
      updatedRows: result.updates?.updatedRows,
      updatedColumns: result.updates?.updatedColumns,
      updatedCells: result.updates?.updatedCells
    });

    // Extract row number from the updated range
    const updatedRange = result.updates?.updatedRange;
    let rowNumber = 0;
    
    if (updatedRange) {
      console.log('🔍 APPEND: Extracting row number from updated range', {
        updatedRange
      });
      
      const match = updatedRange.match(/:(\d+)$/);
      if (match) {
        rowNumber = parseInt(match[1], 10);
        console.log('✅ APPEND: Successfully extracted row number', {
          rowNumber,
          match: match[0],
          fullMatch: match
        });
      } else {
        console.warn('⚠️ APPEND: Could not extract row number from updated range', {
          updatedRange,
          regexUsed: ':(\\d+)$'
        });
      }
    } else {
      console.warn('⚠️ APPEND: No updatedRange in response', {
        result
      });
    }
    
    console.log('✅ APPEND: Successfully appended data to sheet', {
      sessionId: session.id,
      rowNumber,
      sheetId,
      sheetName
    });

    return rowNumber;
  } catch (error) {
    console.error('💥 APPEND: Exception appending data to sheet', {
      error: error.message,
      stack: error.stack,
      sessionId: session.id,
      sheetId,
      sheetName,
      row,
      url
    });
    throw error;
  }
}

serve(async (req: Request) => {
  console.log('🚀 EXPORT: Starting sheets-exporter function', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ EXPORT: Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔧 EXPORT: Setting up Supabase client');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log('🌐 EXPORT: Environment variables check', {
      hasSupabaseUrl: !!supabaseUrl,
      supabaseUrlLength: supabaseUrl.length,
      hasServiceKey: !!supabaseServiceRoleKey,
      serviceKeyLength: supabaseServiceRoleKey.length
    });
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log('✅ EXPORT: Supabase client created successfully');
    
    console.log('📥 EXPORT: Parsing request body');
    const requestBody = await req.json();
    const { sessionId, configId, exportAll = false } = requestBody;
    
    console.log('📊 EXPORT: Request parameters', {
      sessionId,
      configId,
      exportAll,
      fullRequestBody: requestBody
    });

    console.log('🗂️ EXPORT: Initializing data containers');
    let sessions: CollectedDataSession[] = [];
    let config: GoogleSheetsConfig | null = null;

    if (sessionId) {
      console.log('📋 EXPORT: Processing single session export', { sessionId });
      
      // Export single session
      console.log('🔍 EXPORT: Querying collected_data_sessions table');
      const { data: session, error: sessionError } = await supabase
        .from('collected_data_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      console.log('📊 EXPORT: Session query result', {
        hasSession: !!session,
        sessionError: sessionError?.message,
        sessionId: session?.id,
        isComplete: session?.is_complete,
        configId: session?.config_id
      });

      if (sessionError || !session) {
        console.error('❌ EXPORT: Session not found', {
          sessionId,
          error: sessionError?.message,
          errorCode: sessionError?.code
        });
        throw new Error(`Session not found: ${sessionError?.message || 'Unknown error'}`);
      }

      if (!session.is_complete) {
        console.error('❌ EXPORT: Session is not complete', {
          sessionId,
          isComplete: session.is_complete,
          missingFields: session.missing_fields
        });
        throw new Error('Session is not complete');
      }

      sessions = [session];
      console.log('✅ EXPORT: Single session loaded successfully', {
        sessionId: session.id,
        phoneNumber: session.phone_number,
        conversationId: session.conversation_id
      });
      
      // Get config from session
      console.log('🔍 EXPORT: Querying google_sheets_config table for session config');
      const { data: configData, error: configError } = await supabase
        .from('google_sheets_config')
        .select('*')
        .eq('id', session.config_id)
        .single();

      console.log('📊 EXPORT: Config query result', {
        hasConfig: !!configData,
        configError: configError?.message,
        configId: configData?.id,
        sheetId: configData?.google_sheet_id,
        sheetName: configData?.sheet_name
      });

      if (configError || !configData) {
        console.error('❌ EXPORT: Google Sheets configuration not found', {
          configId: session.config_id,
          error: configError?.message,
          errorCode: configError?.code
        });
        throw new Error(`Google Sheets configuration not found: ${configError?.message || 'Unknown error'}`);
      }
      
      config = configData;
      console.log('✅ EXPORT: Config loaded successfully', {
        configId: config.id,
        googleSheetId: config.google_sheet_id,
        sheetName: config.sheet_name,
        googleEmail: config.google_email
      });
    } else if (configId && exportAll) {
      console.log('📂 EXPORT: Processing bulk export for all complete sessions', { configId });
      
      // Export all complete sessions
      console.log('🔍 EXPORT: Querying google_sheets_config table for bulk config');
      const { data: configData, error: configError } = await supabase
        .from('google_sheets_config')
        .select('*')
        .eq('id', configId)
        .single();

      console.log('📊 EXPORT: Bulk config query result', {
        hasConfig: !!configData,
        configError: configError?.message,
        configId: configData?.id,
        sheetId: configData?.google_sheet_id
      });

      if (configError || !configData) {
        console.error('❌ EXPORT: Google Sheets configuration not found for bulk export', {
          configId,
          error: configError?.message,
          errorCode: configError?.code
        });
        throw new Error(`Google Sheets configuration not found: ${configError?.message || 'Unknown error'}`);
      }
      
      config = configData;
      console.log('✅ EXPORT: Bulk config loaded successfully', {
        configId: config.id,
        googleSheetId: config.google_sheet_id,
        sheetName: config.sheet_name
      });

      console.log('🔍 EXPORT: Querying for complete sessions to export');
      const { data: completeSessions, error: sessionsError } = await supabase
        .from('collected_data_sessions')
        .select('*')
        .eq('config_id', configId)
        .eq('is_complete', true)
        .eq('exported_to_sheets', false);

      console.log('📊 EXPORT: Complete sessions query result', {
        hasCompleteSessions: !!completeSessions,
        sessionsError: sessionsError?.message,
        sessionsCount: completeSessions?.length || 0,
        configId
      });

      if (sessionsError) {
        console.error('❌ EXPORT: Error fetching complete sessions', {
          configId,
          error: sessionsError.message,
          errorCode: sessionsError.code
        });
        throw sessionsError;
      }

      sessions = completeSessions || [];
      console.log('✅ EXPORT: Complete sessions loaded successfully', {
        sessionsCount: sessions.length,
        sessionIds: sessions.map(s => s.id)
      });
    } else {
      console.error('❌ EXPORT: Invalid request parameters', {
        sessionId,
        configId,
        exportAll,
        hasSessionId: !!sessionId,
        hasConfigId: !!configId,
        isExportAll: exportAll
      });
      throw new Error('Invalid request parameters - must provide either sessionId or (configId with exportAll=true)');
    }

    console.log('📊 EXPORT: Validating sessions and configuration', {
      sessionsCount: sessions.length,
      hasConfig: !!config,
      googleSheetId: config?.google_sheet_id
    });

    if (sessions.length === 0) {
      console.log('⚠️ EXPORT: No sessions to export, returning early');
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
      console.error('❌ EXPORT: Google Sheet ID not configured', {
        hasConfig: !!config,
        googleSheetId: config?.google_sheet_id,
        configKeys: config ? Object.keys(config) : []
      });
      throw new Error('Google Sheet ID not configured');
    }

    console.log('✅ EXPORT: Validation passed, proceeding with export');

    // Get data collection fields
    console.log('🔍 EXPORT: Querying data collection fields', {
      configId: config.id
    });
    
    const { data: fields, error: fieldsError } = await supabase
      .from('data_collection_fields')
      .select('field_name, field_display_name, field_order, column_letter')
      .eq('config_id', config.id)
      .eq('is_active', true)
      .order('field_order');

    console.log('📊 EXPORT: Data collection fields query result', {
      hasFields: !!fields,
      fieldsError: fieldsError?.message,
      fieldsCount: fields?.length || 0,
      fields: fields?.map(f => ({ name: f.field_name, displayName: f.field_display_name, order: f.field_order }))
    });

    if (fieldsError || !fields || fields.length === 0) {
      console.error('❌ EXPORT: No fields configured', {
        configId: config.id,
        fieldsError: fieldsError?.message,
        fieldsCount: fields?.length || 0
      });
      throw new Error(`No fields configured: ${fieldsError?.message || 'No active fields found'}`);
    }

    console.log('✅ EXPORT: Data collection fields loaded successfully', {
      fieldsCount: fields.length,
      firstFewFields: fields.slice(0, 3).map(f => f.field_display_name)
    });

    // Get Google access token
    console.log('🔐 EXPORT: Getting Google access token');
    const accessToken = await getAccessToken(supabase, config);
    console.log('✅ EXPORT: Successfully obtained access token', {
      tokenLength: accessToken?.length,
      hasToken: !!accessToken
    });

    // Check if sheet has headers
    console.log('📋 EXPORT: Checking if sheet has headers');
    const headers = await getSheetHeaders(accessToken, config.google_sheet_id, config.sheet_name);
    
    console.log('📊 EXPORT: Sheet headers check result', {
      headersCount: headers.length,
      hasHeaders: headers.length > 0,
      headers: headers.slice(0, 5)
    });
    
    if (headers.length === 0) {
      // Create headers if they don't exist
      console.log('🏗️ EXPORT: No headers found, creating sheet headers');
      await createSheetHeaders(accessToken, config.google_sheet_id, config.sheet_name, fields);
      console.log('✅ EXPORT: Sheet headers created successfully');
    } else {
      console.log('✅ EXPORT: Sheet headers already exist, proceeding with data export');
    }

    // Export each session
    console.log('🚀 EXPORT: Starting to export sessions to Google Sheets', {
      sessionsCount: sessions.length,
      sessionIds: sessions.map(s => s.id)
    });
    
    const exportResults = [];
    let sessionIndex = 0;
    
    for (const session of sessions) {
      sessionIndex++;
      console.log(`📤 EXPORT: Processing session ${sessionIndex}/${sessions.length}`, {
        sessionId: session.id,
        phoneNumber: session.phone_number,
        conversationId: session.conversation_id,
        collectedDataKeys: Object.keys(session.collected_data || {})
      });
      
      try {
        console.log(`➕ EXPORT: Appending data to sheet for session ${session.id}`);
        const rowNumber = await appendDataToSheet(
          accessToken,
          config.google_sheet_id,
          config.sheet_name,
          session,
          fields
        );
        
        console.log(`✅ EXPORT: Data appended successfully for session ${session.id}`, {
          rowNumber,
          sessionId: session.id
        });

        // Update session as exported
        console.log(`🔄 EXPORT: Updating session ${session.id} as exported`);
        const updateData = {
          exported_to_sheets: true,
          sheet_row_number: rowNumber,
          exported_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from('collected_data_sessions')
          .update(updateData)
          .eq('id', session.id);

        if (updateError) {
          console.error(`❌ EXPORT: Failed to update session ${session.id}`, {
            error: updateError.message,
            errorCode: updateError.code,
            updateData
          });
        } else {
          console.log(`✅ EXPORT: Successfully updated session ${session.id} as exported`);
        }

        // Log export
        console.log(`📝 EXPORT: Logging successful export for session ${session.id}`);
        const logData = {
          session_id: session.id,
          config_id: config.id,
          sheet_id: config.google_sheet_id,
          row_number: rowNumber,
          exported_data: session.collected_data,
          status: 'success'
        };
        
        const { error: logError } = await supabase
          .from('sheets_export_logs')
          .insert(logData);

        if (logError) {
          console.error(`❌ EXPORT: Failed to log successful export for session ${session.id}`, {
            error: logError.message,
            errorCode: logError.code,
            logData
          });
        } else {
          console.log(`✅ EXPORT: Successfully logged export for session ${session.id}`);
        }

        exportResults.push({
          session_id: session.id,
          row_number: rowNumber,
          status: 'success'
        });
        
        console.log(`🎉 EXPORT: Successfully completed export for session ${session.id}`);
      } catch (error) {
        console.error(`💥 EXPORT: Failed to export session ${session.id}`, {
          error: error.message,
          stack: error.stack,
          sessionId: session.id,
          phoneNumber: session.phone_number
        });
        
        // Log failed export
        console.log(`📝 EXPORT: Logging failed export for session ${session.id}`);
        const failLogData = {
          session_id: session.id,
          config_id: config.id,
          sheet_id: config.google_sheet_id,
          exported_data: session.collected_data,
          status: 'failed',
          error_message: error.message
        };
        
        const { error: failLogError } = await supabase
          .from('sheets_export_logs')
          .insert(failLogData);
          
        if (failLogError) {
          console.error(`❌ EXPORT: Failed to log failed export for session ${session.id}`, {
            error: failLogError.message,
            errorCode: failLogError.code
          });
        }

        // Update retry count
        console.log(`🔄 EXPORT: Updating retry count for failed session ${session.id}`);
        const retryUpdateData = {
          retry_count: session.retry_count + 1,
          export_error: error.message
        };
        
        const { error: retryUpdateError } = await supabase
          .from('collected_data_sessions')
          .update(retryUpdateData)
          .eq('id', session.id);
          
        if (retryUpdateError) {
          console.error(`❌ EXPORT: Failed to update retry count for session ${session.id}`, {
            error: retryUpdateError.message,
            retryUpdateData
          });
        }

        exportResults.push({
          session_id: session.id,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    console.log('📊 EXPORT: Completed processing all sessions', {
      totalSessions: sessions.length,
      resultsCount: exportResults.length,
      successfulExports: exportResults.filter(r => r.status === 'success').length,
      failedExports: exportResults.filter(r => r.status === 'failed').length
    });

    const successCount = exportResults.filter(r => r.status === 'success').length;
    const failedCount = exportResults.filter(r => r.status === 'failed').length;
    
    console.log('📈 EXPORT: Final export summary', {
      successCount,
      failedCount,
      totalSessions: sessions.length,
      successRate: `${((successCount / sessions.length) * 100).toFixed(1)}%`,
      sheetId: config.google_sheet_id
    });

    const responseData = {
      exported: successCount,
      total: sessions.length,
      results: exportResults,
      sheet_id: config.google_sheet_id,
      sheet_url: `https://docs.google.com/spreadsheets/d/${config.google_sheet_id}`
    };
    
    console.log('✅ EXPORT: Returning successful response', {
      responseData
    });

    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('💥 EXPORT: Critical error in sheets-exporter function', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse = { 
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});