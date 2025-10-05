import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";


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

  // Personality system fields
  selectedPersonalityId?: string;
  selectedPersonalityName?: string;
  detectedIntent?: string;
  intentConfidence?: number;
  
  // Data Collection fields
  dataCollectionFields?: any[];
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant that answers questions based on the provided context.

CONTEXT EVALUATION AND RESPONSE GUIDELINES:
1. If the provided context contains relevant information that directly answers the user's question, use it to provide a helpful response
2. Pay attention to similarity scores in the context - scores above 0.3 generally indicate relevant information
3. If the context seems partially relevant but not perfectly matching, use the relevant parts and acknowledge any limitations
4. If the context is clearly unrelated to the user's question, politely say you don't have enough information
5. For greeting messages or general questions, provide appropriate responses even without specific context

RESPONSE QUALITY:
- Prioritize accuracy and helpfulness over being overly cautious
- If you can provide useful information from the context, do so clearly and directly
- Be honest about any uncertainty but don't be unnecessarily restrictive
- For pricing, services, or product questions, use any relevant information from the context

FORMATTING RULES:
- Always be concise, professional, and accurate
- Don't use markdown formatting - format text as plain text for WhatsApp
- Don't use headings with # symbols
- Don't format links as [text](url) - instead write the text followed by the URL if needed
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
const MAX_CONTEXT_TOKENS = 12000;    // زيادة من 3000 إلى 12000 للجودة العالية
const MAX_CONVERSATION_TOKENS = 4000; // زيادة من 1000 إلى 4000
const MAX_RAG_TOKENS = 8000;         // زيادة من 2000 إلى 8000

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

    for (let i = 0; i < messages.reverse().length; i++) {
      const message = messages[i];
      
      // إضافة تصنيف للرسائل الأخيرة لتوضيح الترتيب
      const isLastMessage = i === messages.length - 1;
      const isSecondLast = i === messages.length - 2;
      const prefix = isLastMessage ? '[LAST MESSAGE] ' : isSecondLast ? '[PREVIOUS] ' : '';
      
      const formattedMsg = `${prefix}${message.role.toUpperCase()}: ${message.content}\n\n`;
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
  const MIN_RAG_TOKENS = 2000;  // زيادة من 500 إلى 2000 لضمان سياق RAG كافي

  if (conversationTokens > MIN_CONVERSATION_TOKENS && totalTokens > maxContextTokens) {
    let targetConvTokens = Math.min(
      conversationTokens,
      Math.max(
        MIN_CONVERSATION_TOKENS,
        Math.floor(maxContextTokens * 0.2)  // تقليل من 30% إلى 20% لإعطاء 80% للـ RAG
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
    const includedLines = [];

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

  // تحسين: فقط قطع RAG إذا كان كبير جداً وتجاوز الحد بكثير
  if (ragTokens > MIN_RAG_TOKENS && totalTokens > maxContextTokens * 1.2) {  // إضافة هامش 20% قبل القطع
    const targetRagTokens = Math.min(
      ragTokens,
      Math.max(
        MIN_RAG_TOKENS * 2,  // مضاعفة الحد الأدنى للـ RAG للحفاظ على المزيد من المحتوى
        maxContextTokens - estimateTokens(trimmedConversation)
      )
    );

    const sections = ragContent.split('\n\n---\n\n');
    let currentTokens = 0;
    const includedSections = [];

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

/**
 * Check and update AI usage limits using stored procedure
 * Ensures atomic operation to prevent race conditions
 */
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
    // Use stored procedure for atomic operation
    const { data, error } = await supabaseAdmin.rpc('check_and_update_ai_usage', {
      p_user_id: userId,
      p_increment: increment
    });

    if (error) {
      logger.error('Stored procedure failed:', error);
      // Return safe defaults on error
      return { 
        allowed: true, 
        limit: 0, 
        used: 0, 
        resetsOn: null,
        errorMessage: 'Error checking limits' 
      };
    }

    if (data) {
      logger.log(`AI usage check complete: ${data.used}/${data.limit}, allowed: ${data.allowed}`);
      
      // Return data from stored procedure with same structure
      return {
        allowed: data.allowed,
        limit: data.limit,
        used: data.used,
        resetsOn: data.resetsOn,
        errorMessage: data.errorMessage || (!data.allowed ? `Monthly AI response limit reached (${data.used}/${data.limit})` : undefined)
      };
    }
    
    // Should not reach here, but handle as error case
    return { 
      allowed: true, 
      limit: 0, 
      used: 0, 
      resetsOn: null,
      errorMessage: 'Unexpected response from stored procedure' 
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
      model = 'gpt-4.1-mini', 
      temperature = 0.3,
      systemPrompt,
      includeConversationHistory = false,
      conversationId,
      maxContextTokens = MAX_CONTEXT_TOKENS,
      imageUrl,
      userId,

      // Personality system fields
      selectedPersonalityId,
      selectedPersonalityName,
      detectedIntent,
      intentConfidence,
      
      // Data Collection fields
      dataCollectionFields
    } = await req.json() as GenerateResponseRequest;

    logger.log(`Processing request for user ID: ${userId || 'not provided'}`, {
      hasPersonality: !!selectedPersonalityId,
      personalityName: selectedPersonalityName,
      detectedIntent,
      intentConfidence
    });

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
    
    // Data Collection Enhancement
    if (dataCollectionFields && dataCollectionFields.length > 0) {
      finalSystemPrompt += `\n\nDATA COLLECTION GUIDELINES:
You must analyze if the user's message indicates they need a service that requires data collection.

WHEN TO COLLECT DATA:
- User wants to book/schedule something → Collect: name, phone, preferred time
- User wants to purchase/order → Collect: name, phone, address  
- User has a complaint/issue → Collect: name, contact details, issue description
- User requests a consultation → Collect relevant contact and preference data

WHEN NOT TO COLLECT DATA:
- User asking about prices, general information, or FAQ-type questions
- User just greeting or having casual conversation

REQUIRED FIELDS FOR THIS BUSINESS:
${dataCollectionFields.map(field => 
  `- "${field.field_name}": ${field.field_display_name} (${field.field_type})${field.is_required ? ' [REQUIRED]' : ''}`
).join('\n')}

RESPONSE FORMAT:
You must return your response as a JSON object with this exact structure:
{
  "response": "Your normal response to the user",
  "needsDataCollection": true/false,
  "requestedFields": ["field1", "field2"] // Only if needsDataCollection is true
}

IMPORTANT: If needsDataCollection is true, naturally integrate requests for missing data into your response.`;
    }
    
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

    // إضافة متغير للتحقق من طول الرسالة
    const isShortMessage = query && query.length <= 30;

    // إذا كانت الرسالة قصيرة، نضيف تنبيه بسيط للذكاء الاصطناعي
    const userMessage = finalContext ? 
      `${isShortMessage ? 'Note: This might be a direct response to the last message in the conversation.\n\n' : ''}Context:\n${finalContext}\n\nCurrent message: ${query || "Please describe this image"}` : 
      `${isShortMessage ? 'Note: This might be a direct response to a previous question.\n\n' : ''}Message: ${query || "Please describe this image"}`;

    // Make OpenAI API call
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
    const apiKey = getNextOpenAIKey();
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
          completion: responseData.usage?.completion_tokens || 0,
          total: responseData.usage?.total_tokens || 0
        },
        aiUsage: usageDetails,
        conversationId: conversationId,
        // SMART: Personality metadata
        personalityInfo: selectedPersonalityId ? {
          personalityId: selectedPersonalityId,
          personalityName: selectedPersonalityName,
          detectedIntent,
          intentConfidence,
          personalitySystemUsed: true
        } : {
          personalitySystemUsed: false
        }
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
