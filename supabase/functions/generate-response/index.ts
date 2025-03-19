
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
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

// Default system prompt if none is provided
const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant that answers questions based on the provided context. 
If the information to answer the question is not in the context, say "I don't have enough information to answer that question."
If the question is not related to the context, still try to be helpful but make it clear that you're providing general knowledge.
Always be concise, professional, and accurate. Don't make things up.`;

// System prompt addition for empty context
const EMPTY_CONTEXT_ADDITION = `
The user's message doesn't appear to match any specific content in our knowledge base.
If this is a greeting or general question, please respond appropriately.
For greetings, acknowledge the greeting and ask how you can help.
For general questions, provide a helpful response if you can, or politely explain that you need more specific information.`;

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

// Post-processing function to convert double asterisks to single asterisks for WhatsApp
function formatTextForWhatsApp(text: string): string {
  if (!text) return text;
  
  // Replace double asterisks with single asterisks for bold formatting
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
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
      maxContextTokens = MAX_CONTEXT_TOKENS
    } = await req.json() as GenerateResponseRequest;

    if (!query) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Query is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Generating response for query: "${query}" with model: ${model}, temperature: ${temperature}`);
    console.log(`Context available: ${context ? 'Yes' : 'No'}`);
    if (conversationId) {
      console.log(`Using conversation ID: ${conversationId}`);
    }

    // Use the provided system prompt or fall back to the default
    let finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // If context is empty, add special instructions to handle greetings and general questions
    if (!context || context.trim() === '') {
      finalSystemPrompt += EMPTY_CONTEXT_ADDITION;
    }

    // Apply advanced token management to balance conversation history and RAG content
    const { finalContext, tokenCounts } = balanceContextTokens(
      context,
      '',
      maxContextTokens
    );
    
    console.log(`Token allocation - Conversation: ${tokenCounts.conversation}, RAG: ${tokenCounts.rag}, Total: ${tokenCounts.total}`);

    // Prepare the user message with the balanced context
    const userMessage = finalContext ? 
      `Context:\n${finalContext}\n\nQuestion: ${query}` : 
      `Question: ${query}`;

    // Call OpenAI API to generate response
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
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
