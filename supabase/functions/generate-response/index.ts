
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface GenerateResponseRequest {
  query: string;
  context: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  includeConversationHistory?: boolean;
  conversationId?: string;
  maxContextTokens?: number;
  imageUrl?: string; // New field for multimodal support
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

// Default system prompt if none is provided
const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant that answers questions based on the provided context. 
If the information to answer the question is not in the context, say "I don't have enough information to answer that question."
If the question is not related to the context, still try to be helpful but make it clear that you're providing general knowledge.
Always be concise, professional, and accurate. Don't make things up.
IMPORTANT: Don't use markdown formatting in your responses. Format your text as plain text for WhatsApp.
- Don't use headings with # symbols
- Don't format links as [text](url) - instead write the text followed by the URL on a new line if needed
- Use *text* for emphasis instead of **text**`;

// System prompt addition for empty context
const EMPTY_CONTEXT_ADDITION = `
The user's message doesn't appear to match any specific content in our knowledge base.
If this is a greeting or general question, please respond appropriately.
For greetings, acknowledge the greeting and ask how you can help.
For general questions, provide a helpful response if you can, or politely explain that you need more specific information.`;

// System prompt addition for image context
const IMAGE_CONTEXT_ADDITION = `
The user has sent an image. Please analyze the image and respond appropriately.
If there is text in the image, please mention that you can see it.
If there is a question about the image, respond based on what you can see in it.
Be descriptive but concise in your analysis of the image content.`;

// Initialize Supabase client (only when conversation features are used)
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Token estimation constants
const TOKENS_PER_CHAR = 0.25; // Approximate ratio of tokens to characters
const MAX_CONTEXT_TOKENS = 3000; // Default maximum context tokens
const MAX_CONVERSATION_TOKENS = 1000; // Default maximum for conversation history
const MAX_RAG_TOKENS = 2000; // Default maximum for RAG content

// Helper function to estimate token count from text
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

// Function to retrieve conversation history
async function getConversationHistory(conversationId: string, maxTokens: number = MAX_CONVERSATION_TOKENS): Promise<string> {
  try {
    // Get the last few messages from the conversation, ordered by timestamp
    const { data: messages, error } = await supabaseAdmin
      .from('whatsapp_conversation_messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(10);  // Limit to last 10 messages
    
    if (error) {
      console.error('Error fetching conversation history:', error);
      return '';
    }
    
    if (!messages || messages.length === 0) {
      return '';
    }
    
    // Format messages into a conversation history string, latest messages first
    let historyText = '';
    let currentTokens = 0;
    
    // Process messages in reverse (oldest first)
    for (const message of messages.reverse()) {
      const formattedMsg = `${message.role.toUpperCase()}: ${message.content}\n\n`;
      const msgTokens = estimateTokens(formattedMsg);
      
      // Check if adding this message would exceed the token limit
      if (currentTokens + msgTokens > maxTokens) {
        break;
      }
      
      historyText += formattedMsg;
      currentTokens += msgTokens;
    }
    
    return historyText.trim();
  } catch (error) {
    console.error('Failed to get conversation history:', error);
    return '';
  }
}

// Advanced function to balance conversation history and RAG content
function balanceContextTokens(
  conversationHistory: string, 
  ragContent: string, 
  maxContextTokens: number = MAX_CONTEXT_TOKENS
): { finalContext: string, tokenCounts: { conversation: number, rag: number, total: number } } {
  // Get token estimates
  const conversationTokens = estimateTokens(conversationHistory);
  const ragTokens = estimateTokens(ragContent);
  const totalTokens = conversationTokens + ragTokens;
  
  // If everything fits, return the full context
  if (totalTokens <= maxContextTokens) {
    const finalContext = conversationHistory ? 
      `CONVERSATION HISTORY:\n${conversationHistory}\n\n${ragContent ? `RELEVANT INFORMATION:\n${ragContent}` : ''}` : 
      (ragContent ? `RELEVANT INFORMATION:\n${ragContent}` : '');
    
    return {
      finalContext,
      tokenCounts: { conversation: conversationTokens, rag: ragTokens, total: totalTokens }
    };
  }
  
  // If we need to trim, allocate tokens proportionally but with minimums
  let trimmedConversation = conversationHistory;
  let trimmedRag = ragContent;
  
  // Calculate target token counts
  const MIN_CONVERSATION_TOKENS = 300; // Preserve at least this much conversation
  const MIN_RAG_TOKENS = 500; // Preserve at least this much RAG content
  
  // If conversation is too large, trim it (preserve most recent messages)
  if (conversationTokens > MIN_CONVERSATION_TOKENS && totalTokens > maxContextTokens) {
    // Calculate how much conversation history we can keep
    let targetConvTokens = Math.min(
      conversationTokens,
      Math.max(
        MIN_CONVERSATION_TOKENS,
        Math.floor(maxContextTokens * 0.3) // Allocate 30% to conversation by default
      )
    );
    
    // If RAG content is small, we can allocate more to conversation
    if (ragTokens < MIN_RAG_TOKENS) {
      targetConvTokens = Math.min(
        conversationTokens,
        maxContextTokens - ragTokens
      );
    }
    
    // Trim conversation to target token count (from the end to keep most recent)
    const lines = conversationHistory.split('\n\n');
    let currentTokens = 0;
    let includedLines = [];
    
    // Start from the end (most recent) and work backwards
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTokens = estimateTokens(lines[i]);
      if (currentTokens + lineTokens <= targetConvTokens) {
        includedLines.unshift(lines[i]); // Add to beginning
        currentTokens += lineTokens;
      } else {
        break;
      }
    }
    
    trimmedConversation = includedLines.join('\n\n');
  }
  
  // If RAG is too large, trim it (preserve highest similarity matches)
  if (ragTokens > MIN_RAG_TOKENS && totalTokens > maxContextTokens) {
    // Calculate how much RAG content we can keep
    const targetRagTokens = Math.min(
      ragTokens,
      Math.max(
        MIN_RAG_TOKENS,
        maxContextTokens - estimateTokens(trimmedConversation)
      )
    );
    
    // Trim RAG to target token count
    const sections = ragContent.split('\n\n---\n\n');
    let currentTokens = 0;
    let includedSections = [];
    
    // Preserve sections until we hit the limit
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
  
  // Assemble the balanced context
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

// Enhanced post-processing function to format text for WhatsApp
function formatTextForWhatsApp(text: string): string {
  if (!text) return text;
  
  // Process the text in multiple stages
  let formattedText = text;
  
  // 1. Replace markdown headings (# Heading) with plain text emphasis
  formattedText = formattedText.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');
  
  // 2. Replace markdown links [text](url) with "text: url"
  formattedText = formattedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    return `${text}: ${url}`;
  });
  
  // 3. Replace double asterisks with single asterisks for bold formatting
  formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // 4. Replace any remaining markdown formatting that isn't WhatsApp compatible
  formattedText = formattedText.replace(/`([^`]+)`/g, '"$1"'); // Replace code blocks with quotes
  
  // 5. Fix bullet points if needed (optional)
  // If using - for bullets, can leave as is since WhatsApp supports these
  
  return formattedText;
}

// Helper function to store AI response in conversation if conversation ID is provided
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
    
    console.log(`Stored AI response in conversation ${conversationId}`);
  } catch (error) {
    console.error('Error storing response in conversation:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
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
      imageUrl  // New parameter for image URL
    } = await req.json() as GenerateResponseRequest;

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

    console.log(`Generating response for query: "${query}" with model: ${model}, temperature: ${temperature}`);
    console.log(`Context available: ${context ? 'Yes' : 'No'}`);
    console.log(`Image URL provided: ${imageUrl ? 'Yes' : 'No'}`);
    if (conversationId) {
      console.log(`Using conversation ID: ${conversationId}`);
    }

    // Use the provided system prompt or fall back to the default
    let finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // If system prompt doesn't already have formatting instructions, add them
    if (!finalSystemPrompt.includes("Don't use markdown")) {
      finalSystemPrompt += `\n\nIMPORTANT: Don't use markdown formatting in your responses. Format your text as plain text for WhatsApp.
- Don't use headings with # symbols
- Don't format links as [text](url) - instead write the text followed by the URL on a new line if needed
- Use *text* for emphasis instead of **text**`;
    }
    
    // Add image-specific instructions if an image is provided
    if (imageUrl) {
      finalSystemPrompt += IMAGE_CONTEXT_ADDITION;
    }
    // If context is empty and no image, add special instructions to handle greetings and general questions
    else if (!context || context.trim() === '') {
      finalSystemPrompt += EMPTY_CONTEXT_ADDITION;
    }

    // Get conversation history if requested and conversation ID is provided
    let conversationHistory = '';
    if (includeConversationHistory && conversationId) {
      conversationHistory = await getConversationHistory(conversationId, MAX_CONVERSATION_TOKENS);
      console.log(`Retrieved conversation history: ${conversationHistory ? 'Yes' : 'No'}`);
    }

    // Apply advanced token management to balance conversation history and RAG content
    const { finalContext, tokenCounts } = balanceContextTokens(
      conversationHistory,
      context,
      maxContextTokens
    );
    
    console.log(`Token allocation - Conversation: ${tokenCounts.conversation}, RAG: ${tokenCounts.rag}, Total: ${tokenCounts.total}`);

    // Prepare the user message with the balanced context
    const userMessage = finalContext ? 
      `Context:\n${finalContext}\n\nQuestion: ${query || "Please describe this image"}` : 
      `Question: ${query || "Please describe this image"}`;

    // Prepare the messages array for OpenAI API
    const messages = [
      { role: 'system', content: finalSystemPrompt },
    ];

    // Add image content if provided
    if (imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      });
      console.log(`Added image to message content: ${imageUrl.substring(0, 50)}...`);
    } else {
      // Regular text-only message
      messages.push({ role: 'user', content: userMessage });
    }

    // Call OpenAI API to generate response
    console.log(`Calling OpenAI API with ${messages.length} messages, model: ${model}`);
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
      console.error(`OpenAI API error (${openaiResponse.status}):`, errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const responseData = await openaiResponse.json();
    let generatedAnswer = responseData.choices[0].message.content;
    
    // Apply WhatsApp formatting post-processing
    generatedAnswer = formatTextForWhatsApp(generatedAnswer);

    // If conversationId is provided, store the response in the conversation
    if (conversationId) {
      await storeResponseInConversation(conversationId, generatedAnswer);
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
        conversationId: conversationId // Return the conversation ID if it was provided
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in generate-response function:', error);
    
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
