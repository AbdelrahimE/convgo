
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

  // Initialize Supabase client with service role key
  let supabaseAdmin = null;
  try {
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );
  } catch (initError) {
    console.error("Error initializing Supabase client:", initError.message);
    return new Response(JSON.stringify({
      status: "error",
      message: "Failed to initialize database connection",
      error: initError.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  try {
    // Log function start with more detailed info
    try {
      await supabaseAdmin.from("webhook_debug_logs").insert({
        category: "MESSAGE_BATCH_PROCESSOR",
        message: "Message batch processor started",
        data: { 
          timestamp: new Date().toISOString(),
          request_method: req.method,
          trigger_source: req.headers.get('x-trigger-source') || 'direct' 
        }
      });
    } catch (logError) {
      console.error("Failed to write initial log:", logError.message);
      // Continue execution even if logging fails
    }

    // Check if we're processing a specific message (from trigger)
    let requestData = {};
    try {
      if (req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
        requestData = await req.json();
        
        // Log the request data
        try {
          await supabaseAdmin.from("webhook_debug_logs").insert({
            category: "MESSAGE_BATCH_PROCESSOR",
            message: "Received message processing request",
            data: { requestData }
          });
        } catch (logError) {
          console.error("Failed to log request data:", logError.message);
        }
        
        // Process single message if specified
        if (requestData && requestData.message_id) {
          try {
            const { data: messageData, error: messageError } = await supabaseAdmin
              .from("whatsapp_message_buffer")
              .select("*")
              .eq("id", requestData.message_id)
              .eq("status", "pending")
              .maybeSingle();
              
            if (messageError) {
              throw new Error(`Error fetching specific message: ${messageError.message}`);
            }
            
            if (messageData) {
              // Process this single message
              try {
                await supabaseAdmin.from("webhook_debug_logs").insert({
                  category: "MESSAGE_BATCH_PROCESSOR",
                  message: `Processing specific message from trigger: ${messageData.id}`,
                  data: { message: messageData }
                });
              } catch (logError) {
                console.error("Failed to log message processing:", logError.message);
              }
              
              // Call the webhook handler directly for immediate processing
              try {
                const webhookResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    "X-Batch-Id": crypto.randomUUID(),
                    "X-Single-Message": "true"
                  },
                  body: JSON.stringify({
                    single_message: true,
                    message_id: messageData.message_id,
                    instance: messageData.instance_id,
                    user_phone: messageData.user_phone,
                    message_content: messageData.message_content,
                    message_type: messageData.message_type,
                    media_url: messageData.media_url
                  })
                });
                
                const responseStatus = webhookResponse.status;
                const responseOk = webhookResponse.ok;
                
                try {
                  await supabaseAdmin.from("webhook_debug_logs").insert({
                    category: "MESSAGE_BATCH_PROCESSOR",
                    message: `Processed specific message ${messageData.id} with result: ${responseStatus}`,
                    data: { 
                      status: responseStatus,
                      ok: responseOk
                    }
                  });
                } catch (logError) {
                  console.error("Failed to log webhook response:", logError.message);
                }
                
                // Mark message as processed if the webhook call was successful
                if (responseOk) {
                  await supabaseAdmin
                    .from("whatsapp_message_buffer")
                    .update({ 
                      status: "processed", 
                      processed_at: new Date().toISOString() 
                    })
                    .eq("id", messageData.id);
                } else {
                  // Log the error response
                  let errorText = "";
                  try {
                    errorText = await webhookResponse.text();
                  } catch (e) {
                    errorText = "Failed to read error response";
                  }
                  
                  try {
                    await supabaseAdmin.from("webhook_debug_logs").insert({
                      category: "MESSAGE_BATCH_ERROR",
                      message: `Error processing specific message ${messageData.id}`,
                      data: { 
                        status: responseStatus,
                        errorText 
                      }
                    });
                  } catch (logError) {
                    console.error("Failed to log error response:", logError.message);
                  }
                }
              } catch (singleMsgError) {
                try {
                  await supabaseAdmin.from("webhook_debug_logs").insert({
                    category: "MESSAGE_BATCH_ERROR",
                    message: `Exception processing specific message ${messageData.id}`,
                    data: { error: singleMsgError.message }
                  });
                } catch (logError) {
                  console.error("Failed to log single message error:", logError.message);
                }
              }
              
              return new Response(JSON.stringify({
                status: "success",
                message: `Processed specific message: ${messageData.id}`
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              });
            }
          } catch (specificMessageError) {
            console.error("Error processing specific message:", specificMessageError.message);
            try {
              await supabaseAdmin.from("webhook_debug_logs").insert({
                category: "MESSAGE_BATCH_ERROR",
                message: "Error processing specific message request",
                data: { error: specificMessageError.message, stack: specificMessageError.stack }
              });
            } catch (logError) {
              console.error("Failed to log specific message error:", logError.message);
            }
            
            return new Response(JSON.stringify({
              status: "error",
              message: "Error processing specific message",
              error: specificMessageError.message
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            });
          }
        }
      }
    } catch (jsonError) {
      console.error("Error parsing request JSON:", jsonError.message);
      try {
        await supabaseAdmin.from("webhook_debug_logs").insert({
          category: "MESSAGE_BATCH_ERROR",
          message: "Error parsing request JSON",
          data: { error: jsonError.message }
        });
      } catch (logError) {
        console.error("Failed to log JSON parsing error:", logError.message);
      }
      // Continue with normal batch processing
    }

    // 1. Find conversations with pending messages
    const { data: conversationsWithPendingMessages, error: conversationsError } = await supabaseAdmin
      .from("whatsapp_message_buffer")
      .select("conversation_id, user_phone, instance_id")
      .eq("status", "pending")
      .is("batch_id", null)
      .order("received_at", { ascending: true })
      .group_by("conversation_id, user_phone, instance_id");

    if (conversationsError) {
      console.error("Error fetching conversations:", conversationsError.message);
      try {
        await supabaseAdmin.from("webhook_debug_logs").insert({
          category: "MESSAGE_BATCH_ERROR",
          message: "Error fetching conversations with pending messages",
          data: { error: conversationsError.message }
        });
      } catch (logError) {
        console.error("Failed to log conversations error:", logError.message);
      }
      
      throw new Error(`Error fetching conversations: ${conversationsError.message}`);
    }

    if (!conversationsWithPendingMessages || conversationsWithPendingMessages.length === 0) {
      console.log("No pending messages found");
      return new Response(JSON.stringify({
        status: "success",
        message: "No pending messages found"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Log the conversations found
    try {
      await supabaseAdmin.from("webhook_debug_logs").insert({
        category: "MESSAGE_BATCH_PROCESSOR",
        message: `Found ${conversationsWithPendingMessages.length} conversations with pending messages`,
        data: { conversations: conversationsWithPendingMessages }
      });
    } catch (logError) {
      console.error("Failed to log conversations found:", logError.message);
    }

    // 2. Process each conversation
    for (const conversation of conversationsWithPendingMessages) {
      try {
        // Check if there are any AI configurations for this instance
        const { data: aiConfig, error: aiConfigError } = await supabaseAdmin
          .from("whatsapp_ai_config")
          .select("*")
          .eq("whatsapp_instance_id", conversation.instance_id)
          .eq("is_active", true)
          .maybeSingle();

        if (aiConfigError) {
          console.error("Error fetching AI config:", aiConfigError.message);
          try {
            await supabaseAdmin.from("webhook_debug_logs").insert({
              category: "MESSAGE_BATCH_ERROR",
              message: `Error fetching AI config for instance ${conversation.instance_id}`,
              data: { error: aiConfigError.message }
            });
          } catch (logError) {
            console.error("Failed to log AI config error:", logError.message);
          }
        }

        if (!aiConfig) {
          // If AI is not enabled for this instance, mark messages as skipped
          try {
            const { data: messageIds, error: messageIdsError } = await supabaseAdmin
              .from("whatsapp_message_buffer")
              .select("id")
              .eq("conversation_id", conversation.conversation_id)
              .eq("status", "pending");

            if (messageIdsError) {
              console.error("Error fetching message IDs:", messageIdsError.message);
              continue;
            }

            if (messageIds && messageIds.length > 0) {
              await supabaseAdmin
                .from("whatsapp_message_buffer")
                .update({ status: "skipped", processed_at: new Date().toISOString() })
                .in("id", messageIds.map(m => m.id));

              try {
                await supabaseAdmin.from("webhook_debug_logs").insert({
                  category: "MESSAGE_BATCH_PROCESSOR",
                  message: `Skipped ${messageIds.length} messages for conversation ${conversation.conversation_id} as AI is not enabled`,
                });
              } catch (logError) {
                console.error("Failed to log skipped messages:", logError.message);
              }
            }
          } catch (skipError) {
            console.error("Error skipping messages:", skipError.message);
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
          console.error("Error fetching pending messages:", messagesError.message);
          try {
            await supabaseAdmin.from("webhook_debug_logs").insert({
              category: "MESSAGE_BATCH_ERROR",
              message: `Error fetching pending messages for conversation ${conversation.conversation_id}`,
              data: { error: messagesError.message }
            });
          } catch (logError) {
            console.error("Failed to log pending messages error:", logError.message);
          }
          
          throw new Error(`Error fetching pending messages: ${messagesError.message}`);
        }

        if (!pendingMessages || pendingMessages.length === 0) {
          continue;
        }

        // Generate a new batch ID
        const batchId = crypto.randomUUID();

        // Tag all messages with the batch ID
        const { error: updateError } = await supabaseAdmin
          .from("whatsapp_message_buffer")
          .update({ batch_id: batchId })
          .in("id", pendingMessages.map(m => m.id));
          
        if (updateError) {
          console.error("Error updating batch ID:", updateError.message);
          try {
            await supabaseAdmin.from("webhook_debug_logs").insert({
              category: "MESSAGE_BATCH_ERROR",
              message: `Error updating batch ID for messages in conversation ${conversation.conversation_id}`,
              data: { error: updateError.message, batchId }
            });
          } catch (logError) {
            console.error("Failed to log batch ID update error:", logError.message);
          }
          continue;
        }

        // Log the batch creation
        try {
          await supabaseAdmin.from("webhook_debug_logs").insert({
            category: "MESSAGE_BATCH_PROCESSOR",
            message: `Created batch ${batchId} with ${pendingMessages.length} messages for conversation ${conversation.conversation_id}`,
            data: { batch_id: batchId, message_count: pendingMessages.length }
          });
        } catch (logError) {
          console.error("Failed to log batch creation:", logError.message);
        }

        // If there's only one message, process it individually
        if (pendingMessages.length === 1) {
          // Prepare the webhook event to forward to the webhook handler
          const singleMessage = pendingMessages[0];
          
          try {
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

            let responseText = "";
            try {
              responseText = await response.text();
            } catch (textError) {
              responseText = "Unable to read response text: " + textError.message;
            }
            
            try {
              await supabaseAdmin.from("webhook_debug_logs").insert({
                category: "MESSAGE_BATCH_PROCESSOR",
                message: `Processed single message in batch ${batchId}`,
                data: { 
                  status: response.status,
                  ok: response.ok,
                  response: responseText.substring(0, 500) // Limit response text size
                }
              });
            } catch (logError) {
              console.error("Failed to log single message processing:", logError.message);
            }
            
            if (!response.ok) {
              console.error(`Error processing single message: ${response.status} - ${responseText}`);
              throw new Error(`Error processing single message: ${response.status} - ${responseText}`);
            }
          } catch (singleError) {
            console.error("Error processing single message:", singleError.message);
            try {
              await supabaseAdmin.from("webhook_debug_logs").insert({
                category: "MESSAGE_BATCH_ERROR",
                message: `Error processing single message in batch ${batchId}`,
                data: { error: singleError.message }
              });
            } catch (logError) {
              console.error("Failed to log single message error:", logError.message);
            }
            continue; // Continue with other conversations
          }
        } else {
          // Combine multiple messages into a single batched message
          const combinedMessage = pendingMessages
            .map(msg => msg.message_content)
            .join("\n\n");
          
          try {
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

            let responseText = "";
            try {
              responseText = await response.text();
            } catch (textError) {
              responseText = "Unable to read response text: " + textError.message;
            }
            
            try {
              await supabaseAdmin.from("webhook_debug_logs").insert({
                category: "MESSAGE_BATCH_PROCESSOR",
                message: `Processed batch ${batchId} with ${pendingMessages.length} messages`,
                data: { 
                  status: response.status,
                  ok: response.ok,
                  message_count: pendingMessages.length,
                  response: responseText.substring(0, 500) // Limit response text size
                }
              });
            } catch (logError) {
              console.error("Failed to log batch processing:", logError.message);
            }
            
            if (!response.ok) {
              console.error(`Error processing batch: ${response.status} - ${responseText}`);
              throw new Error(`Error processing batch: ${response.status} - ${responseText}`);
            }
          } catch (batchError) {
            console.error("Error processing batch:", batchError.message);
            try {
              await supabaseAdmin.from("webhook_debug_logs").insert({
                category: "MESSAGE_BATCH_ERROR",
                message: `Error processing batch ${batchId}`,
                data: { error: batchError.message }
              });
            } catch (logError) {
              console.error("Failed to log batch error:", logError.message);
            }
            continue; // Continue with other conversations
          }
        }

        // Mark messages as processed
        const { error: processedError } = await supabaseAdmin
          .from("whatsapp_message_buffer")
          .update({ status: "processed", processed_at: new Date().toISOString() })
          .eq("batch_id", batchId);
          
        if (processedError) {
          console.error("Error marking messages as processed:", processedError.message);
          try {
            await supabaseAdmin.from("webhook_debug_logs").insert({
              category: "MESSAGE_BATCH_ERROR",
              message: `Error marking messages as processed for batch ${batchId}`,
              data: { error: processedError.message }
            });
          } catch (logError) {
            console.error("Failed to log processed marking error:", logError.message);
          }
        }
        
      } catch (conversationError) {
        // Log any errors processing a specific conversation
        console.error("Error processing conversation:", conversationError.message);
        try {
          await supabaseAdmin.from("webhook_debug_logs").insert({
            category: "MESSAGE_BATCH_ERROR",
            message: `Error processing conversation ${conversation.conversation_id}`,
            data: { error: conversationError.message }
          });
        } catch (logError) {
          console.error("Failed to log conversation error:", logError.message);
        }
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
    console.error("Uncaught error in message batch processor:", error.message, error.stack);
    try {
      if (supabaseAdmin) {
        await supabaseAdmin.from("webhook_debug_logs").insert({
          category: "MESSAGE_BATCH_ERROR",
          message: "Error in message batch processor",
          data: { error: error.message, stack: error.stack }
        });
      }
    } catch (logError) {
      console.error("Failed to log uncaught error:", logError.message);
    }

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
