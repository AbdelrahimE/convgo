 # WhatsApp Instances Section - Comprehensive Technical Analysis

  Frontend Architecture & UI Components

  Core Pages and Components

  1. WhatsAppLink Component (src/pages/WhatsAppLink.tsx)

  Primary Interface: Main dashboard for WhatsApp instance management

  Key Features:
  - Instance Creation: Form-based creation with alphanumeric validation
  - QR Code Display: Real-time QR scanning interface for WhatsApp linking
  - Status Management: Live status updates (CONNECTED, DISCONNECTED, CONNECTING, CREATED)
  - Call Rejection Settings: Configure auto-reject with custom messages
  - Real-time Updates: Supabase real-time subscriptions for status changes

  UI Elements:
  - Empty state with guided onboarding
  - Instance cards with actions (Connect/Disconnect/Delete)
  - Modal forms for creation and call rejection configuration
  - Status badges with color-coded indicators

  2. WhatsAppAIConfig Component (src/pages/WhatsAppAIConfig.tsx)

  Purpose: AI configuration and testing interface

  Features:
  - System Prompt Management: Custom AI behavior configuration
  - Voice Processing Settings: Toggle and language selection
  - Test Environment: Interactive chatbot testing with conversation history
  - Prompt Generation: AI-powered system prompt creation with usage limits

  3. WhatsAppSupportConfig Component (src/pages/WhatsAppSupportConfig.tsx)

  Purpose: Human support escalation configuration

  Features:
  - Support Contact Setup: Phone number configuration for escalations
  - Keyword Management: Define trigger words for automatic escalation
  - Message Templates: Customize escalation and notification messages
  - Escalated Conversations Tracking: Monitor resolved/unresolved support cases

  4. Supporting Components:

  - WhatsAppAIToggle: Enable/disable AI responses with status indicators
  - WhatsAppWebhookManager: Webhook connectivity and voice processing testing
  - EscalatedConversations: Support conversation management interface

  Database Schema Analysis

  Core Tables

  whatsapp_instances

  - id (uuid, primary key)
  - user_id (uuid, references profiles)
  - instance_name (text, unique identifier)
  - status (text: CREATED/CONNECTING/CONNECTED/DISCONNECTED)
  - last_connected (timestamp)
  - reject_calls (boolean)
  - reject_calls_message (text)
  - created_at/updated_at (timestamps)

  whatsapp_ai_config

  - id (uuid, primary key)
  - whatsapp_instance_id (uuid, one-to-one with instances)
  - user_id (uuid)
  - system_prompt (text)
  - temperature (numeric)
  - is_active (boolean)
  - process_voice_messages (boolean)
  - voice_message_default_response (text)
  - default_voice_language (text)

  whatsapp_conversations & whatsapp_conversation_messages

  -- Conversations
  - id (uuid)
  - instance_id (uuid, references instances)
  - user_phone (text)
  - status (text: active/expired/escalated)
  - conversation_data (jsonb)

  -- Messages
  - id (uuid)
  - conversation_id (uuid, references conversations)
  - role (text: user/assistant)
  - content (text)
  - metadata (jsonb)

  Support Tables

  - whatsapp_support_config: Support phone numbers and templates
  - whatsapp_support_keywords: Escalation trigger words
  - whatsapp_escalated_conversations: Support case tracking
  - whatsapp_file_mappings: Instance-to-file associations

  Evolution API Integration

  API Server Configuration

  Base URL: https://api.botifiy.com
  Authentication: API Key via apikey header

  Request Types & Endpoints

  1. CREATE_INSTANCE

  - Endpoint: POST /instance/create
  - Payload:
  {
    "instanceName": "user_defined_name",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }
  - Response: QR code data for WhatsApp scanning

  2. CONNECT_INSTANCE

  - Endpoint: GET /instance/connect/{instanceName}
  - Purpose: Reconnect disconnected instances
  - Response: QR code for re-authentication

  3. CHECK_STATUS

  - Endpoint: GET /instance/connectionState/{instanceName}
  - Purpose: Monitor connection status
  - Response: Connection state mapping (open/connecting/close)

  4. LOGOUT_INSTANCE

  - Endpoint: DELETE /instance/logout/{instanceName}
  - Purpose: Disconnect WhatsApp session

  5. DELETE_INSTANCE

  - Endpoint: DELETE /instance/delete/{instanceName}
  - Purpose: Permanently remove instance

  6. CALL_SETTINGS

  - Endpoint: POST /settings/set/{instanceName}
  - Payload:
  {
    "rejectCall": boolean,
    "msgCall": "rejection_message",
    "groupsIgnore": false,
    "alwaysOnline": false,
    "readMessages": false,
    "syncFullHistory": false,
    "readStatus": false
  }

  Request Flow Architecture

  Frontend → Supabase Edge Function → Evolution API

  Pattern:
  1. Frontend: User action triggers API call
  2. Supabase Function: evolution-api function processes request
  3. Evolution API: External API handles WhatsApp operations
  4. Database: Status updates stored in Supabase
  5. Real-time: UI updates via Supabase subscriptions

  Example Flow - Instance Creation:

  WhatsAppLink.tsx (createInstance)
    ↓
  supabase.functions.invoke('evolution-api', {
    operation: 'CREATE_INSTANCE', 
    instanceName: 'userInput' 
  })
    ↓
  evolution-api/index.ts (CREATE_INSTANCE case)
    ↓
  POST https://api.botifiy.com/instance/create
    ↓
  QR Code Response Processing
    ↓
  Database Insert: whatsapp_instances table
    ↓
  Real-time Update: Frontend receives status change

  Advanced Features

  Real-time Synchronization

  - Supabase Channels: Live instance status updates
  - Connection Monitoring: Automatic status polling
  - QR Code Refresh: Dynamic QR code generation

  Security & Validation

  - Input Validation: Alphanumeric instance names only
  - Instance Limits: Per-user instance quotas
  - Authentication: JWT-based user access control

  Webhook Integration

  - Incoming Message Processing: Automated via whatsapp-webhook function
  - AI Response Generation: Context-aware responses using document embeddings
  - Voice Message Transcription: Audio-to-text processing with language detection
  - Support Escalation: Keyword-triggered human handoff

  Error Handling & Logging

  - Centralized Logging: Debug logs for webhook events
  - Error Recovery: Graceful handling of API failures
  - User Feedback: Toast notifications for all operations

  This architecture demonstrates a sophisticated WhatsApp automation platform with comprehensive instance management, AI-powered responses, and seamless Evolution API
  integration for reliable WhatsApp Business operations.