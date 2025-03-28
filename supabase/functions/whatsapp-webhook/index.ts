import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";
import { WebhookData } from "../_shared/escalation-utils.ts";

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_ASSISTANT_ID = Deno.env.get('OPENAI_ASSISTANT_ID') || '';
const OPENAI_API_URL = Deno.env.get('OPENAI_API_URL') || 'https://api.openai.com/v1';
const WHISPER_API_URL = Deno.env.get('WHISPER_API_URL') || 'https://api.openai.com/v1/audio/transcriptions';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Main webhook handler
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the webhook data
    const webhookData = await req.json() as WebhookData;
    
    // Log the webhook event for debugging
    console.log(`Received webhook event: ${webhookData.event} from instance: ${webhookData.instance}`);

    // Only process messages.upsert events (incoming messages)
    if (webhookData.event !== 'messages.upsert') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Event ignored, only processing messages.upsert events' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get the instance ID from the database
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, openai_assistant_id, is_active, ai_enabled')
      .eq('instance_name', webhookData.instance)
      .single();

    if (instanceError || !instanceData) {
      console.error(`Instance not found: ${webhookData.instance}`, instanceError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'WhatsApp instance not found in database' 
      }), { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Skip processing if instance is not active
    if (!instanceData.is_active) {
      console.log(`Skipping inactive instance: ${webhookData.instance}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Instance is not active, skipping processing' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Extract message data
    const messageData = webhookData.data;
    
    // Skip messages sent by the bot itself
    if (messageData.key.fromMe) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Skipping message from bot' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Extract the phone number from the remoteJid
    const phoneNumber = messageData.key.remoteJid.split('@')[0];
    
    // Extract message content
    let messageContent = '';
    let messageType = 'text';
    let mediaUrl = '';
    let mediaKey = '';
    let mimeType = '';
    let transcribedText = '';
    
    // Check for different message types
    if (messageData.message.conversation) {
      messageContent = messageData.message.conversation;
      messageType = 'text';
    } 
    else if (messageData.message.extendedTextMessage?.text) {
      messageContent = messageData.message.extendedTextMessage.text;
      messageType = 'text';
    }
    else if (messageData.message.imageMessage) {
      messageType = 'image';
      mediaUrl = messageData.message.imageMessage.url;
      mediaKey = messageData.message.imageMessage.mediaKey;
      mimeType = messageData.message.imageMessage.mimetype;
      messageContent = messageData.message.imageMessage.caption || '';
    }
    else if (messageData.message.audioMessage) {
      messageType = 'audio';
      mediaUrl = messageData.message.audioMessage.url;
      mediaKey = messageData.message.audioMessage.mediaKey;
      mimeType = messageData.message.audioMessage.mimetype;
      
      // Process audio for transcription if it's a voice message
      if (messageData.message.audioMessage.ptt) {
        console.log('Voice message detected, will attempt transcription');
        
        try {
          // First, we need to get the decrypted audio file
          const imageProcessResponse = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-image-process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              imageUrl: mediaUrl,
              mediaKey: mediaKey,
              mimeType: mimeType,
              instanceName: webhookData.instance,
              evolutionApiKey: EVOLUTION_API_KEY
            })
          });
          
          if (!imageProcessResponse.ok) {
            throw new Error(`Failed to process audio: ${imageProcessResponse.status} ${imageProcessResponse.statusText}`);
          }
          
          const imageProcessResult = await imageProcessResponse.json();
          
          if (!imageProcessResult.success || !imageProcessResult.mediaUrl) {
            throw new Error('Failed to get decrypted audio URL');
          }
          
          console.log('Successfully decrypted voice message, proceeding with transcription');
          
          // Now we have the decrypted audio URL, download the file
          const audioResponse = await fetch(imageProcessResult.mediaUrl);
          if (!audioResponse.ok) {
            throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
          }
          
          // Get the audio data as a blob
          const audioBlob = await audioResponse.blob();
          
          // Create a FormData object for the Whisper API
          const formData = new FormData();
          formData.append('file', audioBlob, 'audio.ogg');
          formData.append('model', 'whisper-1');
          
          // Call the Whisper API for transcription
          const whisperResponse = await fetch(WHISPER_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: formData
          });
          
          if (!whisperResponse.ok) {
            const errorText = await whisperResponse.text();
            throw new Error(`Whisper API error: ${whisperResponse.status} ${errorText}`);
          }
          
          const transcriptionResult = await whisperResponse.json();
          transcribedText = transcriptionResult.text || '';
          
          console.log(`Transcription successful: "${transcribedText}"`);
          
          // Use the transcribed text as the message content for further processing
          messageContent = transcribedText;
        } catch (error) {
          console.error('Error transcribing voice message:', error);
          // Continue processing even if transcription fails
        }
      }
    }
    else if (messageData.message.videoMessage) {
      messageType = 'video';
      mediaUrl = messageData.message.videoMessage.url;
      mediaKey = messageData.message.videoMessage.mediaKey;
      mimeType = messageData.message.videoMessage.mimetype;
      messageContent = messageData.message.videoMessage.caption || '';
    }
    else if (messageData.message.documentMessage) {
      messageType = 'document';
      mediaUrl = messageData.message.documentMessage.url;
      mediaKey = messageData.message.documentMessage.mediaKey;
      mimeType = messageData.message.documentMessage.mimetype;
      messageContent = messageData.message.documentMessage.fileName || '';
    }
    else if (messageData.message.stickerMessage) {
      messageType = 'sticker';
      // Stickers typically don't have text content
    }
    else {
      // Unknown message type
      console.log('Unknown message type received:', Object.keys(messageData.message));
      messageType = 'unknown';
    }
    
    // Log the message details
    console.log(`Received ${messageType} message from ${phoneNumber}: "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`);
    
    // Check for support escalation first
    // If we have transcribed text from a voice message, include it in the escalation check
    const escalationUrl = new URL(`${SUPABASE_URL}/functions/v1/whatsapp-support-escalation`);
    escalationUrl.searchParams.set('foundInstanceId', instanceData.id);
    
    // Add transcribed text as a parameter if available
    if (transcribedText) {
      escalationUrl.searchParams.set('transcribedText', transcribedText);
    }
    
    const escalationResponse = await fetch(escalationUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(webhookData)
    });
    
    if (!escalationResponse.ok) {
      console.error('Error checking for escalation:', await escalationResponse.text());
    } else {
      const escalationResult = await escalationResponse.json();
      console.log('Escalation check result:', escalationResult);
      
      // If the message was escalated or should skip AI processing, return early
      if (escalationResult.skip_ai_processing) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Message escalated to human support, skipping AI processing',
          escalation: escalationResult
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }
    
    // Skip AI processing if the instance has AI disabled
    if (!instanceData.ai_enabled) {
      console.log(`AI is disabled for instance ${webhookData.instance}, skipping AI processing`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'AI is disabled for this instance, skipping AI processing' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Skip empty messages
    if (!messageContent.trim() && messageType === 'text') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Empty message, skipping AI processing' 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Use the instance's specific assistant ID if available, otherwise use the default
    const assistantId = instanceData.openai_assistant_id || OPENAI_ASSISTANT_ID;
    
    if (!assistantId) {
      console.error('No OpenAI Assistant ID configured for this instance');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No OpenAI Assistant ID configured' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Check if there's an existing thread for this user
    const { data: threadData, error: threadError } = await supabase
      .from('whatsapp_threads')
      .select('thread_id')
      .eq('whatsapp_instance_id', instanceData.id)
      .eq('user_phone', phoneNumber)
      .single();
    
    let threadId;
    
    if (threadError || !threadData) {
      // Create a new thread
      console.log(`Creating new thread for ${phoneNumber}`);
      
      const createThreadResponse = await fetch(`${OPENAI_API_URL}/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({})
      });
      
      if (!createThreadResponse.ok) {
        console.error('Failed to create thread:', await createThreadResponse.text());
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to create OpenAI thread' 
        }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      const threadResult = await createThreadResponse.json();
      threadId = threadResult.id;
      
      // Save the thread ID
      await supabase.from('whatsapp_threads').insert({
        whatsapp_instance_id: instanceData.id,
        user_phone: phoneNumber,
        thread_id: threadId
      });
    } else {
      threadId = threadData.thread_id;
    }
    
    // Add the user's message to the thread
    const addMessageResponse = await fetch(`${OPENAI_API_URL}/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        role: 'user',
        content: messageContent
      })
    });
    
    if (!addMessageResponse.ok) {
      console.error('Failed to add message to thread:', await addMessageResponse.text());
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to add message to OpenAI thread' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Run the assistant
    const runResponse = await fetch(`${OPENAI_API_URL}/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });
    
    if (!runResponse.ok) {
      console.error('Failed to run assistant:', await runResponse.text());
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to run OpenAI assistant' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const runResult = await runResponse.json();
    const runId = runResult.id;
    
    // Poll for the run to complete
    let runStatus = runResult.status;
    let attempts = 0;
    const maxAttempts = 30; // Maximum number of polling attempts
    
    while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'expired' && attempts < maxAttempts) {
      // Wait for 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkRunResponse = await fetch(`${OPENAI_API_URL}/threads/${threadId}/runs/${runId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!checkRunResponse.ok) {
        console.error('Failed to check run status:', await checkRunResponse.text());
        break;
      }
      
      const checkRunResult = await checkRunResponse.json();
      runStatus = checkRunResult.status;
      attempts++;
      
      console.log(`Run status: ${runStatus}, attempt ${attempts}/${maxAttempts}`);
    }
    
    if (runStatus !== 'completed') {
      console.error(`Run did not complete successfully. Final status: ${runStatus}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `OpenAI run did not complete (status: ${runStatus})` 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Get the assistant's response
    const messagesResponse = await fetch(`${OPENAI_API_URL}/threads/${threadId}/messages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    
    if (!messagesResponse.ok) {
      console.error('Failed to get messages:', await messagesResponse.text());
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to get OpenAI messages' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const messagesResult = await messagesResponse.json();
    
    // Find the most recent assistant message
    const assistantMessages = messagesResult.data
      .filter((msg: any) => msg.role === 'assistant')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    if (assistantMessages.length === 0) {
      console.error('No assistant messages found');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No assistant response found' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const latestAssistantMessage = assistantMessages[0];
    let assistantResponse = '';
    
    // Extract the text content from the message
    for (const contentItem of latestAssistantMessage.content) {
      if (contentItem.type === 'text') {
        assistantResponse += contentItem.text.value;
      }
    }
    
    console.log(`Assistant response: "${assistantResponse.substring(0, 100)}${assistantResponse.length > 100 ? '...' : ''}"`);
    
    // Send the assistant's response back to the user via WhatsApp
    const sendMessageUrl = `${EVOLUTION_API_URL}/message/sendText/${webhookData.instance}`;
    const sendMessageResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: assistantResponse
      })
    });
    
    if (!sendMessageResponse.ok) {
      console.error('Failed to send message to WhatsApp:', await sendMessageResponse.text());
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to send message to WhatsApp' 
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Log the conversation
    await supabase.from('whatsapp_messages').insert({
      whatsapp_instance_id: instanceData.id,
      user_phone: phoneNumber,
      message_direction: 'inbound',
      message_content: messageContent,
      message_type: messageType
    });
    
    await supabase.from('whatsapp_messages').insert({
      whatsapp_instance_id: instanceData.id,
      user_phone: phoneNumber,
      message_direction: 'outbound',
      message_content: assistantResponse,
      message_type: 'text'
    });
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Message processed successfully',
      response: assistantResponse
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: String(error)
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
