import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getNextOpenAIKey } from "../_shared/openai-key-rotation.ts";

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
};

interface CustomEscalationRequest {
  lastUserMessages: string[];  // Last 5 user messages
  currentMessage: string;       // Current user message
  customInstructions: string;   // Custom escalation instructions from user
}

interface CustomEscalationResponse {
  success: boolean;
  needsEscalation: boolean;
  reason: string;
  confidence: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Check if conversation needs escalation based on custom AI instructions
 * Uses GPT-4o-mini for efficient and cost-effective analysis
 */
async function checkCustomEscalation(
  lastUserMessages: string[],
  currentMessage: string,
  customInstructions: string
): Promise<{
  needsEscalation: boolean;
  reason: string;
  confidence: number;
}> {
  try {
    // Validate inputs
    if (!currentMessage || !customInstructions) {
      logger.warn('Missing required inputs for custom escalation check');
      return {
        needsEscalation: false,
        reason: 'Invalid input',
        confidence: 0
      };
    }

    // Prepare context from last messages
    const messageHistory = lastUserMessages
      .filter(msg => msg && msg.trim().length > 0)
      .slice(-5)  // Only last 5 messages
      .map((msg, idx) => `Message ${idx + 1}: ${msg.trim()}`)
      .join('\n');

    const context = messageHistory || 'No previous messages';

    // Create optimized prompt for GPT-4o-mini
    const prompt = `You are an escalation analyzer for a WhatsApp AI support system.

**Custom Escalation Rules (provided by business owner):**
${customInstructions}

**Recent Customer Messages:**
${context}

**Current Customer Message:**
"${currentMessage.trim()}"

**Your Task:**
Analyze if this conversation should be escalated to human support based ONLY on the custom rules above.

**Return ONLY valid JSON:**
{
  "needsEscalation": true/false,
  "reason": "brief explanation why escalation is/isn't needed",
  "confidence": 0.85
}

**Rules:**
1. Only set needsEscalation=true if the message clearly matches the custom instructions
2. Be strict - don't escalate unless there's a clear match
3. confidence should be 0.0 to 1.0 (higher = more confident)
4. reason should be brief (max 100 characters)`;

    const apiKey = getNextOpenAIKey();

    logger.info('🔍 Custom Escalation Check Started:', {
      currentMessagePreview: currentMessage.substring(0, 50) + '...',
      historyMessagesCount: lastUserMessages.length,
      instructionsLength: customInstructions.length,
      timestamp: new Date().toISOString()
    });

    const requestStartTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: currentMessage.trim() }
        ],
        temperature: 0.1,  // Low temperature for consistent results
        max_tokens: 500    // Enough for simple JSON response
      }),
    });

    const requestDuration = Date.now() - requestStartTime;

    logger.info('⏱️ OpenAI Request Completed:', {
      duration_ms: requestDuration,
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`OpenAI API error ${response.status}:`, errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();

    // Validate response structure
    if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
      logger.error('Invalid OpenAI response structure');
      throw new Error('Invalid OpenAI response');
    }

    const rawContent = responseData.choices[0].message.content;
    if (!rawContent) {
      logger.error('Empty content from OpenAI');
      throw new Error('Empty OpenAI response');
    }

    // Clean and parse JSON
    const content = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '');
    let result;

    try {
      result = JSON.parse(content.trim());
    } catch (parseError) {
      logger.error('JSON parsing failed:', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      throw new Error('Failed to parse OpenAI response');
    }

    // Validate and normalize result
    const validatedResult = {
      needsEscalation: Boolean(result.needsEscalation),
      reason: String(result.reason || 'No reason provided').substring(0, 200),
      confidence: Math.min(1.0, Math.max(0.0, Number(result.confidence) || 0.5))
    };

    logger.info('✅ Custom Escalation Analysis Complete:', {
      needsEscalation: validatedResult.needsEscalation,
      confidence: validatedResult.confidence,
      reason: validatedResult.reason,
      processingTime: requestDuration,
      tokenUsage: responseData.usage
    });

    return validatedResult;

  } catch (error) {
    logger.error('❌ Error in custom escalation check:', {
      error: error.message,
      stack: error.stack
    });

    // Safe fallback
    return {
      needsEscalation: false,
      reason: `Error: ${error.message}`,
      confidence: 0
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { lastUserMessages, currentMessage, customInstructions } = await req.json() as CustomEscalationRequest;

    // Validate required fields
    if (!currentMessage || !customInstructions) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'currentMessage and customInstructions are required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    logger.info('📥 Custom Escalation Check Request:', {
      currentMessageLength: currentMessage.length,
      historyMessagesCount: lastUserMessages?.length || 0,
      instructionsLength: customInstructions.length,
      timestamp: new Date().toISOString()
    });

    // Perform custom escalation check
    const analysisResult = await checkCustomEscalation(
      lastUserMessages || [],
      currentMessage,
      customInstructions
    );

    const processingTimeMs = Date.now() - startTime;

    const response: CustomEscalationResponse = {
      success: true,
      needsEscalation: analysisResult.needsEscalation,
      reason: analysisResult.reason,
      confidence: analysisResult.confidence,
      processingTimeMs
    };

    logger.info('🏁 Custom Escalation Check Completed:', {
      needsEscalation: response.needsEscalation,
      confidence: response.confidence,
      processingTimeMs,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;

    logger.error('❌ Critical Error in Custom Escalation Check:', {
      error: error.message,
      stack: error.stack,
      processingTimeMs
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        processingTimeMs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
