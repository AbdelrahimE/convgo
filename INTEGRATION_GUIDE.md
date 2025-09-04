# Google Sheets Data Collection Integration Guide

## Overview
This guide explains how to integrate the new Google Sheets data collection feature with the existing WhatsApp message processing flow.

## Integration Steps

### 1. Update the Message Processor

In the file `/supabase/functions/_shared/buffering-handler.ts`, locate the `processMessageForAIIntegrated` function and add the following imports at the top of the file:

```typescript
import { 
  processDataExtraction, 
  isDataCollectionEnabled,
  mergeDataCollectionResponse,
  getConversationHistoryForExtraction
} from './data-collection-integration.ts';
```

### 2. Add Data Extraction After Message Processing

After the AI response is generated (around where the response is sent back to WhatsApp), add the following code:

```typescript
// Check if data collection is enabled
const dataCollectionEnabled = await isDataCollectionEnabled(instanceName, supabaseAdmin);

if (dataCollectionEnabled && messageText && !isFromMe) {
  // Get conversation history for context
  const conversationHistory = await getConversationHistoryForExtraction(
    conversationId, 
    supabaseAdmin
  );

  // Process data extraction
  const extractionResult = await processDataExtraction(
    instanceName,
    conversationId,
    fromNumber,
    messageText,
    conversationHistory,
    supabaseUrl,
    supabaseServiceKey
  );

  // If there's a data collection message, merge it with the AI response
  if (extractionResult.responseMessage) {
    responseText = mergeDataCollectionResponse(responseText, extractionResult.responseMessage);
  }
}
```

### 3. Environment Variables

Add the following environment variables to your Supabase project:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-app-domain.com/data-collection/callback

# These should already exist:
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: Add your callback URL
   - Download the credentials JSON

### 5. Database Migration

Run the database migration to create the necessary tables:

```bash
supabase db push
```

Or manually run the SQL migration file:
```bash
supabase/migrations/20250104_google_sheets_integration.sql
```

### 6. Deploy Edge Functions

Deploy all the new edge functions:

```bash
# Deploy Google Auth handler
supabase functions deploy google-auth

# Deploy Data Extractor
supabase functions deploy data-extractor

# Deploy Sheets Exporter
supabase functions deploy sheets-exporter
```

### 7. Frontend Setup

The Data Collection page is already added to the React application. Users can access it from the sidebar menu.

## Usage Flow

1. **Setup Phase:**
   - User navigates to Data Collection page
   - Selects a WhatsApp instance
   - Connects their Google account via OAuth
   - Specifies the Google Sheet to use
   - Defines custom fields to collect

2. **Data Collection Phase:**
   - When customers send messages to WhatsApp
   - The system automatically extracts defined fields
   - If required fields are missing, asks the customer
   - Validates the collected data

3. **Export Phase:**
   - Once all required fields are collected
   - Data is automatically exported to Google Sheets
   - Users can also manually trigger exports

## Testing

### Test Data Extraction
```bash
curl -X POST 'https://YOUR_SUPABASE_URL/functions/v1/data-extractor' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "whatsapp_instance_id": "test-instance",
    "conversation_id": "conv-123",
    "phone_number": "+201234567890",
    "message_text": "My name is Ahmed and my email is ahmed@example.com",
    "conversation_history": []
  }'
```

### Test Google Sheets Export
```bash
curl -X POST 'https://YOUR_SUPABASE_URL/functions/v1/sheets-exporter' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "session-uuid-here"
  }'
```

## Security Considerations

1. **OAuth Tokens:** Tokens are encrypted before storage in the database
2. **RLS Policies:** All tables have Row Level Security enabled
3. **Service Role:** Only service role can write to data sessions
4. **User Isolation:** Each user can only see their own configurations and data

## Troubleshooting

### Common Issues

1. **"No Google account connected" error:**
   - Ensure Google OAuth credentials are properly configured
   - Check redirect URI matches exactly

2. **"Failed to export to Google Sheets" error:**
   - Verify the Google Sheet ID is correct
   - Ensure the authenticated user has write access to the sheet
   - Check if the access token needs refreshing

3. **Fields not being extracted:**
   - Review field configuration and keywords
   - Check the extraction prompt templates
   - Verify OpenAI API key is valid

4. **Data collection not triggering:**
   - Ensure data collection is enabled for the WhatsApp instance
   - Verify the instance has a linked Google Sheets configuration
   - Check that fields are defined and active

## Future Enhancements

1. **Additional Integrations:**
   - HubSpot CRM
   - Zoho CRM
   - Airtable
   - Microsoft Excel Online

2. **Advanced Features:**
   - Conditional field logic
   - Multi-step forms
   - File attachments collection
   - Automated data validation rules

3. **Analytics:**
   - Conversion funnel tracking
   - Field completion rates
   - Export success metrics

## Support

For issues or questions, please check:
- The application logs in Supabase Dashboard
- Edge function logs for detailed error messages
- Database tables for data integrity

## API Reference

### Data Collection Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field_name | string | Yes | Internal field identifier |
| field_display_name | string | Yes | Display name in English |
| field_display_name_ar | string | No | Display name in Arabic |
| field_type | enum | Yes | text, phone, email, number, date, address, select, boolean |
| is_required | boolean | Yes | Whether field must be collected |
| extraction_keywords | array | No | Keywords to help identify field |
| prompt_template | string | No | Custom extraction prompt |
| ask_if_missing_template | string | No | Custom message when field is missing |

### Session States

| State | Description |
|-------|-------------|
| is_complete: false | Still collecting data |
| is_complete: true, exported_to_sheets: false | Ready for export |
| is_complete: true, exported_to_sheets: true | Successfully exported |

## License

This feature is part of the ConvGo SaaS platform.