import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getNextOpenAIKey } from "./openai-key-rotation.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

export interface SmartEscalationConfig {
  enable_smart_escalation: boolean;
  escalation_sensitivity: number;
  emotion_threshold: number;
  urgency_threshold: number;
  rag_confidence_threshold: number;
  max_ai_attempts: number;
  escalation_delay_minutes: number;
  ai_attempt_message: string;
  escalation_warning_message: string;
}

export interface SmartEscalationResult {
  shouldEscalate: boolean;
  confidence: number;
  reasoning: string;
  suggestedAction: 'solve_with_ai' | 'escalate_immediate' | 'escalate_with_context';
  contextSummary?: string;
  urgencyLevel: 'low' | 'medium' | 'high';
  emotionalState: string;
  canSolveWithRAG: boolean;
  aiAttemptMessage?: string;
}

export interface RAGCapabilityResult {
  canSolveWithRAG: boolean;
  relevanceScore: number;
  availableContext: string[];
  confidenceLevel: number;
}

/**
 * Get smart escalation configuration for a WhatsApp instance
 */
export async function getSmartEscalationConfig(
  instanceId: string,
  supabaseAdmin: any
): Promise<SmartEscalationConfig | null> {
  try {
    // First check if the table exists and has data
    const { data, error } = await supabaseAdmin
      .from('smart_escalation_config')
      .select('*')
      .eq('whatsapp_instance_id', instanceId)
      .maybeSingle(); // Use maybeSingle to avoid errors when no record exists

    if (error) {
      logger.error('Error fetching smart escalation config:', error);
      // Return default configuration instead of null
      return {
        enable_smart_escalation: true, // Enable by default
        escalation_sensitivity: 0.7,
        emotion_threshold: 0.8,
        urgency_threshold: 0.7,
        rag_confidence_threshold: 0.6,
        max_ai_attempts: 2,
        escalation_delay_minutes: 5,
        ai_attempt_message: 'دعني أحاول مساعدتك في هذا الأمر...',
        escalation_warning_message: 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين'
      };
    }

    if (!data) {
      // No configuration found, return default
      logger.log(`No smart escalation config found for instance ${instanceId}, using defaults`);
      return {
        enable_smart_escalation: true,
        escalation_sensitivity: 0.7,
        emotion_threshold: 0.8,
        urgency_threshold: 0.7,
        rag_confidence_threshold: 0.6,
        max_ai_attempts: 2,
        escalation_delay_minutes: 5,
        ai_attempt_message: 'دعني أحاول مساعدتك في هذا الأمر...',
        escalation_warning_message: 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين'
      };
    }

    logger.log(`Smart escalation config loaded for instance ${instanceId}`);
    return data;
  } catch (error) {
    logger.error('Exception getting smart escalation config:', error);
    // Return default configuration to prevent system failure
    return {
      enable_smart_escalation: true,
      escalation_sensitivity: 0.7,
      emotion_threshold: 0.8,
      urgency_threshold: 0.7,
      rag_confidence_threshold: 0.6,
      max_ai_attempts: 2,
      escalation_delay_minutes: 5,
      ai_attempt_message: 'دعني أحاول مساعدتك في هذا الأمر...',
      escalation_warning_message: 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين'
    };
  }
}

/**
 * Check if a message can be solved using RAG system
 */
export async function checkRAGCapability(
  message: string,
  instanceId: string,
  supabaseAdmin: any
): Promise<RAGCapabilityResult> {
  try {
    // Get files associated with this instance first (following the same pattern as webhook processor)
    const { data: fileMappings, error: fileMappingsError } = await supabaseAdmin
      .from('whatsapp_file_mappings')
      .select('file_id')
      .eq('whatsapp_instance_id', instanceId);

    if (fileMappingsError) {
      logger.error('Error getting file mappings for RAG capability check:', fileMappingsError);
      // Return optimistic result to allow AI processing
      return {
        canSolveWithRAG: true,
        relevanceScore: 0.6,
        availableContext: ['محتوى عام متاح في النظام'],
        confidenceLevel: 0.6
      };
    }

    // Extract file IDs (same as webhook processor)
    const fileIds = fileMappings?.map(mapping => mapping.file_id) || [];
    
    if (fileIds.length === 0) {
      // No files mapped to this instance
      return {
        canSolveWithRAG: false,
        relevanceScore: 0.3,
        availableContext: ['لا يوجد محتوى متاح لهذا الرقم'],
        confidenceLevel: 0.3
      };
    }

    // Now check if we have text chunks for these files (using correct table name)
    const { data: chunks, error } = await supabaseAdmin
      .from('text_chunks')
      .select('content, metadata, file_id')
      .in('file_id', fileIds)
      .limit(5);

    if (error) {
      logger.error('Error checking RAG capability:', error);
      // Return optimistic result to allow AI processing
      return {
        canSolveWithRAG: true,
        relevanceScore: 0.6,
        availableContext: ['محتوى عام متاح في النظام'],
        confidenceLevel: 0.6
      };
    }

    const relevantChunks = chunks || [];
    
    // Simple keyword matching for basic relevance
    const messageKeywords = message.toLowerCase().split(' ');
    let relevanceScore = 0;
    
    if (relevantChunks.length > 0) {
      // Basic relevance scoring
      relevanceScore = Math.min(0.8, 0.4 + (relevantChunks.length * 0.1));
    } else {
      // No specific chunks, but files exist so there might be some help available
      relevanceScore = 0.5;
    }

    const canSolve = relevanceScore >= 0.4; // Lower threshold for testing
    
    return {
      canSolveWithRAG: canSolve,
      relevanceScore: relevanceScore,
      availableContext: relevantChunks.map((chunk: any) => 
        chunk.content ? chunk.content.substring(0, 200) : 'محتوى متاح'
      ),
      confidenceLevel: canSolve ? relevanceScore : 0.3
    };
  } catch (error) {
    logger.error('Exception checking RAG capability:', error);
    // Return optimistic result to allow processing to continue
    return {
      canSolveWithRAG: true,
      relevanceScore: 0.5,
      availableContext: ['محتوى عام متاح'],
      confidenceLevel: 0.5
    };
  }
}

/**
 * Get message embedding for similarity search
 */
async function getMessageEmbedding(message: string): Promise<number[]> {
  try {
    const apiKey = getNextOpenAIKey();
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: message,
        model: 'text-embedding-ada-002'
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    logger.error('Error getting message embedding:', error);
    // Return a zero vector as fallback
    return new Array(1536).fill(0);
  }
}

/**
 * Analyze if escalation is needed using smart criteria
 */
export async function analyzeEscalationNeed(
  message: string,
  conversationHistory: string[],
  intentAnalysis: any,
  emotionAnalysis: any,
  instanceId: string,
  supabaseAdmin: any,
  ragContext?: string
): Promise<SmartEscalationResult> {
  try {
    // Get smart escalation configuration
    const config = await getSmartEscalationConfig(instanceId, supabaseAdmin);
    
    if (!config || !config.enable_smart_escalation) {
      // Fall back to traditional keyword-based escalation
      return {
        shouldEscalate: false,
        confidence: 0.5,
        reasoning: 'Smart escalation is disabled, using traditional method',
        suggestedAction: 'solve_with_ai',
        urgencyLevel: 'medium',
        emotionalState: 'neutral',
        canSolveWithRAG: true
      };
    }

    // Check RAG capability
    const ragCapability = await checkRAGCapability(message, instanceId, supabaseAdmin);
    
    // Analyze urgency and emotion levels
    const urgencyScore = emotionAnalysis?.urgency_detected ? 0.9 : 
                        (emotionAnalysis?.intensity || 0.5);
    
    const emotionScore = emotionAnalysis?.sentiment_score < 0 ? 
                        Math.abs(emotionAnalysis.sentiment_score) : 0.3;

    // Determine urgency level
    const urgencyLevel = urgencyScore >= 0.8 ? 'high' : 
                        urgencyScore >= 0.5 ? 'medium' : 'low';

    // Smart escalation decision logic
    let shouldEscalate = false;
    let suggestedAction: 'solve_with_ai' | 'escalate_immediate' | 'escalate_with_context' = 'solve_with_ai';
    let reasoning = '';

    // Critical escalation conditions (immediate escalation)
    if (emotionScore >= config.emotion_threshold && urgencyScore >= config.urgency_threshold) {
      shouldEscalate = true;
      suggestedAction = 'escalate_immediate';
      reasoning = `High negative emotion (${emotionScore.toFixed(2)}) and urgency (${urgencyScore.toFixed(2)}) detected`;
    }
    // Technical issues beyond RAG capability
    else if (intentAnalysis?.intent === 'technical' && !ragCapability.canSolveWithRAG) {
      shouldEscalate = true;
      suggestedAction = 'escalate_with_context';
      reasoning = `Technical issue detected with low RAG capability (${ragCapability.confidenceLevel.toFixed(2)})`;
    }
    // Specific human-only requests
    else if (message.toLowerCase().includes('تحدث مع شخص') || 
             message.toLowerCase().includes('speak to human') ||
             message.toLowerCase().includes('موظف')) {
      shouldEscalate = true;
      suggestedAction = 'escalate_immediate';
      reasoning = 'Explicit request to speak with human agent';
    }
    // RAG system can handle it
    else if (ragCapability.canSolveWithRAG && ragCapability.confidenceLevel >= config.rag_confidence_threshold) {
      shouldEscalate = false;
      suggestedAction = 'solve_with_ai';
      reasoning = `RAG system can handle this query (confidence: ${ragCapability.confidenceLevel.toFixed(2)})`;
    }
    // Borderline case - try AI first
    else {
      shouldEscalate = false;
      suggestedAction = 'solve_with_ai';
      reasoning = `Borderline case - attempting AI solution first before escalation`;
    }

    // Calculate confidence score
    const confidence = Math.min(0.95, Math.max(0.1, 
      (emotionScore + urgencyScore + (1 - ragCapability.confidenceLevel)) / 3
    ));

    // Context summary for escalation
    const contextSummary = shouldEscalate ? 
      `العميل: ${emotionAnalysis?.emotional_state || 'غير محدد'} | النية: ${intentAnalysis?.intent || 'عامة'} | الاستعجال: ${urgencyLevel} | سجل المحادثة: ${conversationHistory.slice(-3).join(' | ')}` :
      undefined;

    return {
      shouldEscalate,
      confidence,
      reasoning,
      suggestedAction,
      contextSummary,
      urgencyLevel,
      emotionalState: emotionAnalysis?.emotional_state || 'neutral',
      canSolveWithRAG: ragCapability.canSolveWithRAG,
      aiAttemptMessage: config.ai_attempt_message
    };

  } catch (error) {
    logger.error('Error in smart escalation analysis:', error);
    
    // Safe fallback
    return {
      shouldEscalate: false,
      confidence: 0.3,
      reasoning: `Error in analysis, defaulting to AI attempt: ${error}`,
      suggestedAction: 'solve_with_ai',
      urgencyLevel: 'medium',
      emotionalState: 'unknown',
      canSolveWithRAG: false
    };
  }
}

/**
 * Attempt to solve with AI before escalation
 */
export async function attemptAISolution(
  message: string,
  conversationHistory: string[],
  ragContext: string,
  instanceId: string,
  attemptNumber: number = 1
): Promise<{
  success: boolean;
  escalationNeeded: boolean;
  response?: string;
  reasoning: string;
}> {
  try {
    logger.log(`AI solution attempt ${attemptNumber} for instance ${instanceId}`);

    // Generate AI response using existing system
    const aiPrompt = `أنت مساعد ذكي متخصص. حاول حل هذا الاستفسار بناءً على المعلومات المتاحة.

السياق المتاح:
${ragContext}

تاريخ المحادثة:
${conversationHistory.slice(-5).join('\n')}

الاستفسار الحالي: "${message}"

إذا كان بإمكانك الإجابة بثقة، قدم إجابة مفيدة ومفصلة.
إذا لم تكن متأكداً، اذكر ذلك بوضوح واقترح التواصل مع الدعم.`;

    const apiKey = getNextOpenAIKey();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: aiPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const responseData = await response.json();
    const aiResponse = responseData.choices[0].message.content;

    // Analyze if the AI response is confident enough
    const confidenceKeywords = ['لست متأكد', 'لا أعرف', 'غير واضح', 'يرجى التواصل', 'اتصل بالدعم'];
    const hasLowConfidence = confidenceKeywords.some(keyword => 
      aiResponse.toLowerCase().includes(keyword)
    );

    const escalationNeeded = hasLowConfidence || aiResponse.length < 50;

    return {
      success: !escalationNeeded,
      escalationNeeded,
      response: aiResponse,
      reasoning: escalationNeeded ? 
        'AI response shows low confidence or insufficient detail' : 
        'AI provided confident and detailed response'
    };

  } catch (error) {
    logger.error('Error in AI solution attempt:', error);
    return {
      success: false,
      escalationNeeded: true,
      reasoning: `AI attempt failed: ${error}`
    };
  }
}

/**
 * Store smart escalation data
 */
export async function storeSmartEscalationData(
  escalationId: string,
  analysisResult: SmartEscalationResult,
  intentAnalysis: any,
  emotionAnalysis: any,
  aiAttempts: number,
  supabaseAdmin: any
): Promise<void> {
  try {
    await supabaseAdmin
      .from('whatsapp_escalated_conversations')
      .update({
        escalation_type: 'smart_analysis',
        intent_analysis: intentAnalysis,
        emotion_analysis: emotionAnalysis,
        ai_attempts_count: aiAttempts,
        escalation_reasoning: analysisResult.reasoning,
        confidence_score: analysisResult.confidence
      })
      .eq('id', escalationId);

    logger.log(`Stored smart escalation data for escalation ${escalationId}`);
  } catch (error) {
    logger.error('Error storing smart escalation data:', error);
  }
}