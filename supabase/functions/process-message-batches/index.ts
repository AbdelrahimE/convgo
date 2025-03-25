
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

const BATCH_WINDOW_SECONDS = 8; // Time window to collect messages
const MAX_BATCH_SIZE = 10; // Maximum number of messages in a batch

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    // Log function start
    await supabaseAdmin.from("webhook_debug_logs").insert({
      category: "MESSAGE_BATCH_PROCESSOR",
      message: "Message batch processor started",
    });

    // 1. Find conversations with pending messages
    const { data: conversationsWithPendingMessages, error: conversationsError } = await supabaseAdmin
      .from("whatsapp_message_buffer")
      .select("conversation_id, user_phone, instance_id")
      .eq("status", "pending")
      .is("batch_id", null)
      .order("received_at", { ascending: true })
      .group_by("conversation_id, user_phone, instance_id");

    if (conversationsError) {
      throw new Error(`Error fetching conversations: ${conversationsError.message}`);
    }

    if (!conversationsWithPendingMessages || conversationsWithPendingMessages.length === 0) {
      return new Response(JSON.stringify({
        status: "success",
        message: "No pending messages found"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Log the conversations found
    await supabaseAdmin.from("webhook_debug_logs").insert({
      category: "MESSAGE_BATCH_PROCESSOR",
      message: `Found ${conversationsWithPendingMessages.length} conversations with pending messages`,
      data: { conversations: conversationsWithPendingMessages }
    });

    // 2. Process each conversation
    for (const conversation of conversationsWithPendingMessages) {
      try {
        // Check if there are any AI configurations for this instance
        const { data: aiConfig } = await supabaseAdmin
          .from("whatsapp_ai_config")
          .select("*")
          .eq("whatsapp_instance_id", conversation.instance_id)
          .eq("is_active", true)
          .single();

        if (!aiConfig) {
          // If AI is not enabled for this instance, mark messages as skipped
          const { data: messageIds } = await supabaseAdmin
            .from("whatsapp_message_buffer")
            .select("id")
            .eq("conversation_id", conversation.conversation_id)
            .eq("status", "pending");

          if (messageIds && messageIds.length > 0) {
            await supabaseAdmin
              .from("whatsapp_message_buffer")
              .update({ status: "skipped", processed_at: new Date().toISOString() })
              .in("id", messageIds.map(m => m.id));

            await supabaseAdmin.from("webhook_debug_logs").insert({
              category: "MESSAGE_BATCH_PROCESSOR",
              message: `Skipped ${messageIds.length} messages for conversation ${conversation.conversation_id} as AI is not enabled`,
            });
          }
          continue;
        }

        // Find pending messages for this conversation
        const { data: pendingMessages, error: messagesError } = await supabaseAdmin
          .from("whatsapp_message_buffer")
          .select("*")
          .eq("conversation_id", conversation.conversation_id)
          .eq("status", "pending")
          .is("batch_id", null)
          .order("received_at", { ascending: true })
          .limit(MAX_BATCH_SIZE);

        if (messagesError) {
          throw new Error(`Error fetching pending messages: ${messagesError.message}`);
        }

        if (!pendingMessages || pendingMessages.length === 0) {
          continue;
        }

        // Generate a new batch ID
        const batchId = crypto.randomUUID();

        // Tag all messages with the batch ID
        await supabaseAdmin
          .from("whatsapp_message_buffer")
          .update({ batch_id: batchId })
          .in("id", pendingMessages.map(m => m.id));

        // Log the batch creation
        await supabaseAdmin.from("webhook_debug_logs").insert({
          category: "MESSAGE_BATCH_PROCESSOR",
          message: `Created batch ${batchId} with ${pendingMessages.length} messages for conversation ${conversation.conversation_id}`,
          data: { batch_id: batchId, message_count: pendingMessages.length }
        });

        // If there's only one message, process it individually
        if (pendingMessages.length === 1) {
          // Prepare the webhook event to forward to the webhook handler
          const singleMessage = pendingMessages[0];
          
          // Call the existing webhook handler to process the message
          const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "X-Batch-Id": batchId,
              "X-Single-Message": "true"
            },
            body: JSON.stringify({
              single_message: true,
              message_id: singleMessage.message_id,
              instance: singleMessage.instance_id,
              user_phone: singleMessage.user_phone,
              message_content: singleMessage.message_content,
              message_type: singleMessage.message_type,
              media_url: singleMessage.media_url,
              batch_id: batchId
            })
          });

          await supabaseAdmin.from("webhook_debug_logs").insert({
            category: "MESSAGE_BATCH_PROCESSOR",
            message: `Processed single message in batch ${batchId}`,
            data: { 
              status: response.status,
              ok: response.ok
            }
          });
        } else {
          // Combine multiple messages into a single batched message
          const combinedMessage = pendingMessages
            .map(msg => msg.message_content)
            .join("\n\n");
          
          // Call the webhook handler with the batched message
          const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "X-Batch-Id": batchId,
              "X-Batch-Messages": pendingMessages.length.toString()
            },
            body: JSON.stringify({
              batched_messages: true,
              message_ids: pendingMessages.map(m => m.message_id),
              instance: pendingMessages[0].instance_id,
              user_phone: pendingMessages[0].user_phone,
              message_content: combinedMessage,
              message_type: "batched_text",
              batch_id: batchId,
              individual_messages: pendingMessages.map(m => ({
                id: m.id,
                content: m.message_content,
                type: m.message_type,
                media_url: m.media_url,
                received_at: m.received_at
              }))
            })
          });

          await supabaseAdmin.from("webhook_debug_logs").insert({
            category: "MESSAGE_BATCH_PROCESSOR",
            message: `Processed batch ${batchId} with ${pendingMessages.length} messages`,
            data: { 
              status: response.status,
              ok: response.ok,
              message_count: pendingMessages.length
            }
          });
        }

        // Mark messages as processed
        await supabaseAdmin
          .from("whatsapp_message_buffer")
          .update({ status: "processed", processed_at: new Date().toISOString() })
          .eq("batch_id", batchId);
        
      } catch (conversationError) {
        // Log any errors processing a specific conversation
        await supabaseAdmin.from("webhook_debug_logs").insert({
          category: "MESSAGE_BATCH_ERROR",
          message: `Error processing conversation ${conversation.conversation_id}`,
          data: { error: conversationError.message }
        });
      }
    }

    return new Response(JSON.stringify({
      status: "success",
      message: `Processed ${conversationsWithPendingMessages.length} conversations with pending messages`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    // Log any uncaught errors
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    await supabaseAdmin.from("webhook_debug_logs").insert({
      category: "MESSAGE_BATCH_ERROR",
      message: "Error in message batch processor",
      data: { error: error.message }
    });

    return new Response(JSON.stringify({
      status: "error",
      message: "Error processing message batches",
      error: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
