
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

interface GenerateResponseRequest {
  query: string;
  context: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  includeConversationHistory?: boolean;
  conversationId?: string;
  maxContextTokens?: number;
  imageUrl?: string;
  userId?: string;
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant that answers questions based on the provided context. 
If the information to answer the question is not in the context, say "I don't have enough information to answer that question."
If the question is not related to the context, still try to be helpful but make it clear that you're providing general knowledge.
Always be concise, professional, and accurate. Don't make things up.
IMPORTANT: Don't use markdown formatting in your responses. Format your text as plain text for WhatsApp.
- Don't use headings with # symbols
- Don't format links as [text](url) - instead write the text followed by the URL on a new line if needed
- Use *text* for emphasis instead of **text**`;

const EMPTY_CONTEXT_ADDITION = `
The user's message doesn't appear to match any specific content in our knowledge base.
If this is a greeting or general question, please respond appropriately.
For greetings, acknowledge the greeting and ask how you can help.
For general questions, provide a helpful response if you can, or politely explain that you need more specific information.`;

const IMAGE_CONTEXT_ADDITION = `
The user has sent an image. Please analyze the image and respond appropriately.
If there is text in the image, please mention that you can see it.
If there is a question about the image, respond based on what you can see in it.
Be descriptive but concise in your analysis of the image content.`;

const TOKENS_PER_CHAR = 0.25;
const MAX_CONTEXT_TOKENS = 3000;
const MAX_CONVERSATION_TOKENS = 1000;
const MAX_RAG_TOKENS = 2000;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

async function getConversationHistory(conversationId: string, maxTokens: number = MAX_CONVERSATION_TOKENS): Promise<string> {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      logger.error('Error fetching conversation history:', error);
      return '';
    }

    if (!messages || messages.length === 0) {
      return '';
    }

    let historyText = '';
    let currentTokens = 0;

    for (const message of messages.reverse()) {
      const formattedMsg = `${message.role.toUpperCase()}: ${message.content}\n\n`;
      const msgTokens = estimateTokens(formattedMsg);

      if (currentTokens + msgTokens > maxTokens) {
        break;
      }

      historyText += formattedMsg;
      currentTokens += msgTokens;
    }

    return historyText.trim();
  } catch (error) {
    logger.error('Failed to get conversation history:', error);
    return '';
  }
}

function balanceContextTokens(
  conversationHistory: string, 
  ragContent: string, 
  maxContextTokens: number = MAX_CONTEXT_TOKENS
): { finalContext: string, tokenCounts: { conversation: number, rag: number, total: number } } {
  const conversationTokens = estimateTokens(conversationHistory);
  const ragTokens = estimateTokens(ragContent);
  const totalTokens = conversationTokens + ragTokens;

  if (totalTokens <= maxContextTokens) {
    const finalContext = conversationHistory ? 
      `CONVERSATION HISTORY:\n${conversationHistory}\n\n${ragContent ? `RELEVANT INFORMATION:\n${ragContent}` : ''}` : 
      (ragContent ? `RELEVANT INFORMATION:\n${ragContent}` : '');
    
    return {
      finalContext,
      tokenCounts: { conversation: conversationTokens, rag: ragTokens, total: totalTokens }
    };
  }

  let trimmedConversation = conversationHistory;
  let trimmedRag = ragContent;

  const MIN_CONVERSATION_TOKENS = 300;
  const MIN_RAG_TOKENS = 500;

  if (conversationTokens > MIN_CONVERSATION_TOKENS && totalTokens > maxContextTokens) {
    let targetConvTokens = Math.min(
      conversationTokens,
      Math.max(
        MIN_CONVERSATION_TOKENS,
        Math.floor(maxContextTokens * 0.3)
      )
    );

    if (ragTokens < MIN_RAG_TOKENS) {
      targetConvTokens = Math.min(
        conversationTokens,
        maxContextTokens - ragTokens
      );
    }

    const lines = conversationHistory.split('\n\n');
    let currentTokens = 0;
    let includedLines = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTokens = estimateTokens(lines[i]);
      if (currentTokens + lineTokens <= targetConvTokens) {
        includedLines.unshift(lines[i]);
        currentTokens += lineTokens;
      } else {
        break;
      }
    }

    trimmedConversation = includedLines.join('\n\n');
  }

  if (ragTokens > MIN_RAG_TOKENS && totalTokens > maxContextTokens) {
    const targetRagTokens = Math.min(
      ragTokens,
      Math.max(
        MIN_RAG_TOKENS,
        maxContextTokens - estimateTokens(trimmedConversation)
      )
    );

    const sections = ragContent.split('\n\n---\n\n');
    let currentTokens = 0;
    let includedSections = [];

    for (let i = 0; i < sections.length; i++) {
      const sectionTokens = estimateTokens(sections[i]);
      if (currentTokens + sectionTokens <= targetRagTokens) {
        includedSections.push(sections[i]);
        currentTokens += sectionTokens;
      } else {
        break;
      }
    }

    trimmedRag = includedSections.join('\n\n---\n\n');
  }

  const finalTokens = {
    conversation: estimateTokens(trimmedConversation),
    rag: estimateTokens(trimmedRag),
    total: estimateTokens(trimmedConversation) + estimateTokens(trimmedRag)
  };

  let finalContext = '';
  if (trimmedConversation) {
    finalContext += `CONVERSATION HISTORY:\n${trimmedConversation}\n\n`;
  }
  if (trimmedRag) {
    finalContext += `RELEVANT INFORMATION:\n${trimmedRag}`;
  }

  return { finalContext, tokenCounts: finalTokens };
}

function formatTextForWhatsApp(text: string): string {
  if (!text) return text;

  let formattedText = text;

  formattedText = formattedText.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');
  formattedText = formattedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    return `${text}: ${url}`;
  });
  formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '*$1*');
  formattedText = formattedText.replace(/`([^`]+)`/g, '"$1"');

  return formattedText;
}

async function storeResponseInConversation(conversationId: string, responseText: string) {
  if (!conversationId) return;

  try {
    await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: responseText
      });

    logger.log(`Stored AI response in conversation ${conversationId}`);
  } catch (error) {
    logger.error('Error storing response in conversation:', error);
  }
}

async function checkAndUpdateUserLimit(userId: string, increment: boolean = false): Promise<{
  allowed: boolean;
  limit: number;
  used: number;
  resetsOn: string | null;
  errorMessage?: string;
}> {
  if (!userId) {
    logger.error('No userId provided for AI limit check');
    return { 
      allowed: true, 
      limit: 0, 
      used: 0, 
      resetsOn: null,
      errorMessage: 'No user ID provided for limit check' 
    };
  }

  try {
    logger.log(`Checking AI usage limits for user: ${userId}, increment: ${increment}`);
    
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('monthly_ai_response_limit, monthly_ai_responses_used, last_responses_reset_date')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      logger.error('Error fetching user profile for AI limits:', error || 'Profile not found');
      return { 
        allowed: true, 
        limit: 0, 
        used: 0, 
        resetsOn: null,
        errorMessage: 'Error fetching user profile' 
      };
    }

    const limit = profile.monthly_ai_response_limit;
    const used = profile.monthly_ai_responses_used;
    const resetsOn = profile.last_responses_reset_date;
    
    const allowed = used < limit;
    logger.log(`User ${userId} has used ${used}/${limit} AI responses`);

    if (increment && allowed) {
      logger.log(`Incrementing AI usage count for user ${userId} from ${used} to ${used + 1}`);
      
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ monthly_ai_responses_used: used + 1 })
        .eq('id', userId);

      if (updateError) {
        logger.error('Error updating AI usage count:', updateError);
      } else {
        logger.log(`Updated AI usage count for user ${userId}: ${used + 1}/${limit}`);
      }
    } else if (!allowed) {
      logger.warn(`User ${userId} has reached their monthly AI response limit (${used}/${limit})`);
    } else if (!increment) {
      logger.log(`Not incrementing counter for user ${userId} (check only)`);
    }

    const currentDate = new Date(resetsOn || new Date());
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const nextResetDate = nextMonth.toISOString();

    return {
      allowed,
      limit,
      used: increment && allowed ? used + 1 : used,
      resetsOn: nextResetDate,
      errorMessage: !allowed ? `Monthly AI response limit reached (${used}/${limit})` : undefined
    };
  } catch (error) {
    logger.error('Unexpected error checking user AI limits:', error);
    return { 
      allowed: true, 
      limit: 0, 
      used: 0, 
      resetsOn: null,
      errorMessage: 'Unexpected error checking limits' 
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      query, 
      context, 
      model = 'gpt-4o-mini', 
      temperature = 0.3,
      systemPrompt,
      includeConversationHistory = false,
      conversationId,
      maxContextTokens = MAX_CONTEXT_TOKENS,
      imageUrl,
      userId
    } = await req.json() as GenerateResponseRequest;

    logger.log(`Processing request for user ID: ${userId || 'not provided'}`);

    if (!query && !imageUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Either query or image is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    if (userId) {
      logger.log(`Checking AI usage limit for user ${userId}`);
      const limitCheck = await checkAndUpdateUserLimit(userId, false);
      
      if (!limitCheck.allowed) {
        logger.warn(`User ${userId} has exceeded their monthly AI response limit`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Monthly AI response limit reached',
            details: {
              limit: limitCheck.limit,
              used: limitCheck.used,
              resetsOn: limitCheck.resetsOn
            }
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 429
          }
        );
      }
    } else {
      logger.warn('No user ID provided for AI limit tracking');
    }

    let finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    if (!finalSystemPrompt.includes("Don't use markdown")) {
      finalSystemPrompt += `\n\nIMPORTANT: Don't use markdown formatting in your responses. Format your text as plain text for WhatsApp.
- Don't use headings with # symbols
- Don't format links as [text](url) - instead write the text followed by the URL on a new line if needed
- Use *text* for emphasis instead of **text**`;
    }
    
    if (imageUrl) {
      finalSystemPrompt += IMAGE_CONTEXT_ADDITION;
    }
    else if (!context || context.trim() === '') {
      finalSystemPrompt += EMPTY_CONTEXT_ADDITION;
    }

    let conversationHistory = '';
    if (includeConversationHistory && conversationId) {
      conversationHistory = await getConversationHistory(conversationId, MAX_CONVERSATION_TOKENS);
      logger.log(`Retrieved conversation history: ${conversationHistory ? 'Yes' : 'No'}`);
    }

    const { finalContext, tokenCounts } = balanceContextTokens(
      conversationHistory,
      context,
      maxContextTokens
    );
    
    logger.log(`Token allocation - Conversation: ${tokenCounts.conversation}, RAG: ${tokenCounts.rag}, Total: ${tokenCounts.total}`);

    const userMessage = finalContext ? 
      `Context:\n${finalContext}\n\nQuestion: ${query || "Please describe this image"}` : 
      `Question: ${query || "Please describe this image"}`;

    const messages = [
      { role: 'system', content: finalSystemPrompt },
    ];

    if (imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      });
      logger.log(`Added image to message content: ${imageUrl.substring(0, 50)}...`);
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    logger.log(`Calling OpenAI API with ${messages.length} messages, model: ${model}`);
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      logger.error(`OpenAI API error (${openaiResponse.status}):`, errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const responseData = await openaiResponse.json();
    let generatedAnswer = responseData.choices[0].message.content;
    
    generatedAnswer = formatTextForWhatsApp(generatedAnswer);

    if (conversationId) {
      await storeResponseInConversation(conversationId, generatedAnswer);
    }

    let usageDetails = {
      limit: 0,
      used: 0,
      resetsOn: null
    };

    if (userId) {
      logger.log(`Incrementing AI usage count for user ${userId}`);
      const limitUpdate = await checkAndUpdateUserLimit(userId, true);
      usageDetails = {
        limit: limitUpdate.limit,
        used: limitUpdate.used,
        resetsOn: limitUpdate.resetsOn
      };
      
      logger.log(`[AI_COUNTING] Updated usage count for user ${userId}: ${limitUpdate.used}/${limitUpdate.limit}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        answer: generatedAnswer,
        model,
        usage: responseData.usage,
        tokenUsage: {
          context: tokenCounts,
          completion: responseData.usage.completion_tokens,
          total: responseData.usage.total_tokens
        },
        aiUsage: usageDetails,
        conversationId: conversationId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    logger.error('Error in generate-response function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
