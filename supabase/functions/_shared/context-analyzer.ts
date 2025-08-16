/**
 * Advanced Context Analysis and Adaptive Learning System
 * Provides context-aware intent classification and learns from user interactions
 */

import { detectLanguage } from "./language-detector.ts";
import { findBestIntent } from "./semantic-keywords.ts";

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    intent?: string;
    confidence?: number;
  }>;
  patterns: {
    dominant_language: 'ar' | 'en' | 'mixed';
    common_intents: string[];
    conversation_flow: string[];
    user_preferences: {
      response_style: string;
      preferred_language: string;
      topic_interests: string[];
    };
  };
  session_metadata: {
    start_time: string;
    message_count: number;
    avg_response_time: number;
    satisfaction_indicators: number; // -1 to 1
  };
}

export interface ContextualInsight {
  intent_prediction: {
    predicted_intent: string;
    confidence: number;
    reasoning: string;
  };
  conversation_state: {
    phase: 'greeting' | 'inquiry' | 'problem_solving' | 'closing' | 'escalation';
    urgency_level: 'low' | 'medium' | 'high' | 'critical';
    satisfaction_trend: 'improving' | 'stable' | 'declining';
  };
  recommendations: {
    personality_override?: string;
    tone_adjustment?: string;
    escalation_suggestion?: boolean;
    follow_up_needed?: boolean;
  };
}

export interface LearningPattern {
  pattern_id: string;
  pattern_type: 'intent_sequence' | 'language_switch' | 'escalation_trigger' | 'satisfaction_drop';
  trigger_conditions: any;
  observed_outcomes: any;
  confidence_score: number;
  usage_count: number;
  last_seen: string;
}

/**
 * Analyzes conversation context to provide insights
 */
export function analyzeConversationContext(
  conversationHistory: ConversationContext,
  currentMessage: string
): ContextualInsight {
  const messageLanguage = detectLanguage(currentMessage);
  const semanticIntent = findBestIntent(currentMessage, messageLanguage.primary_language);
  
  // Analyze conversation phase
  const conversationPhase = determineConversationPhase(conversationHistory, currentMessage);
  
  // Assess urgency level
  const urgencyLevel = assessUrgencyLevel(currentMessage, conversationHistory, messageLanguage);
  
  // Track satisfaction trend
  const satisfactionTrend = analyzeSatisfactionTrend(conversationHistory);
  
  // Generate contextual predictions
  const intentPrediction = generateContextualIntentPrediction(
    conversationHistory,
    currentMessage,
    semanticIntent
  );
  
  // Generate recommendations
  const recommendations = generateContextualRecommendations(
    conversationPhase,
    urgencyLevel,
    satisfactionTrend,
    conversationHistory
  );
  
  return {
    intent_prediction: intentPrediction,
    conversation_state: {
      phase: conversationPhase,
      urgency_level: urgencyLevel,
      satisfaction_trend: satisfactionTrend
    },
    recommendations
  };
}

/**
 * Determines the current phase of conversation
 */
function determineConversationPhase(
  context: ConversationContext,
  currentMessage: string
): 'greeting' | 'inquiry' | 'problem_solving' | 'closing' | 'escalation' {
  const messageCount = context.session_metadata.message_count;
  const recentMessages = context.messages.slice(-3);
  
  // Greeting patterns
  const greetingPatterns = [
    /\b(hello|hi|hey|مرحبا|أهلا|السلام عليكم|ازيك|اهلين)\b/gi,
    /\b(good morning|good afternoon|صباح الخير|مساء الخير)\b/gi
  ];
  
  // Closing patterns
  const closingPatterns = [
    /\b(thank you|thanks|شكرا|شكرا لك|متشكر|الف شكر)\b/gi,
    /\b(bye|goodbye|وداعا|مع السلامة|الله معك)\b/gi,
    /\b(that's all|that helps|كده كفاية|كدا تمام)\b/gi
  ];
  
  // Escalation patterns
  const escalationPatterns = [
    /\b(manager|supervisor|complain|مدير|مسؤول|شكوى|اشتكي)\b/gi,
    /\b(unacceptable|terrible|awful|مرفوض|فظيع|سيء جدا)\b/gi,
    /\b(cancel|refund|money back|الغي|استرداد|فلوسي)\b/gi
  ];
  
  // Problem-solving patterns
  const problemPatterns = [
    /\b(not working|broken|error|مش شغال|معطل|خطأ|مكسور)\b/gi,
    /\b(fix|solve|help|اصلح|حل|ساعدني)\b/gi
  ];
  
  // Check for escalation first (highest priority)
  if (escalationPatterns.some(pattern => pattern.test(currentMessage))) {
    return 'escalation';
  }
  
  // Check for closing
  if (closingPatterns.some(pattern => pattern.test(currentMessage))) {
    return 'closing';
  }
  
  // Check for greeting (usually early in conversation)
  if (messageCount <= 2 && greetingPatterns.some(pattern => pattern.test(currentMessage))) {
    return 'greeting';
  }
  
  // Check for problem-solving
  if (problemPatterns.some(pattern => pattern.test(currentMessage))) {
    return 'problem_solving';
  }
  
  // Default to inquiry
  return 'inquiry';
}

/**
 * Assesses the urgency level of the current message
 */
function assessUrgencyLevel(
  message: string,
  context: ConversationContext,
  languageResult: any
): 'low' | 'medium' | 'high' | 'critical' {
  const urgentKeywords = {
    critical: [
      'urgent', 'emergency', 'asap', 'immediately', 'critical', 'down', 'crashed',
      'عاجل', 'طوارئ', 'فوري', 'حالا', 'مهم جدا', 'معطل', 'واقف'
    ],
    high: [
      'important', 'serious', 'major', 'significant', 'escalate',
      'مهم', 'خطير', 'كبير', 'مشكلة كبيرة', 'جدي'
    ],
    medium: [
      'problem', 'issue', 'concern', 'trouble',
      'مشكلة', 'قلق', 'متاعب', 'صعوبة'
    ]
  };
  
  const normalizedMessage = message.toLowerCase();
  
  // Check for critical keywords
  if (urgentKeywords.critical.some(keyword => normalizedMessage.includes(keyword.toLowerCase()))) {
    return 'critical';
  }
  
  // Check for high urgency
  if (urgentKeywords.high.some(keyword => normalizedMessage.includes(keyword.toLowerCase()))) {
    return 'high';
  }
  
  // Check for medium urgency
  if (urgentKeywords.medium.some(keyword => normalizedMessage.includes(keyword.toLowerCase()))) {
    return 'medium';
  }
  
  // Consider conversation history
  const recentMessages = context.messages.slice(-3);
  const hasRepeatedIssues = recentMessages.filter(msg => 
    msg.role === 'user' && urgentKeywords.medium.some(keyword => 
      msg.content.toLowerCase().includes(keyword.toLowerCase())
    )
  ).length >= 2;
  
  if (hasRepeatedIssues) {
    return 'high';
  }
  
  return 'low';
}

/**
 * Analyzes satisfaction trend based on conversation history
 */
function analyzeSatisfactionTrend(
  context: ConversationContext
): 'improving' | 'stable' | 'declining' {
  const recentMessages = context.messages.slice(-5);
  
  const positiveIndicators = [
    'thank', 'thanks', 'great', 'perfect', 'excellent', 'good', 'helpful',
    'شكرا', 'ممتاز', 'رائع', 'جيد', 'مفيد', 'تمام', 'كويس'
  ];
  
  const negativeIndicators = [
    'frustrated', 'annoyed', 'angry', 'terrible', 'awful', 'worst', 'hate',
    'زعلان', 'مضايق', 'غضبان', 'فظيع', 'سيء', 'مش كويس', 'وحش'
  ];
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  recentMessages.forEach((msg, index) => {
    if (msg.role === 'user') {
      const weight = (index + 1) / recentMessages.length; // Recent messages have more weight
      
      positiveIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) {
          positiveScore += weight;
        }
      });
      
      negativeIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) {
          negativeScore += weight;
        }
      });
    }
  });
  
  const netScore = positiveScore - negativeScore;
  
  if (netScore > 0.3) return 'improving';
  if (netScore < -0.3) return 'declining';
  return 'stable';
}

/**
 * Generates contextual intent prediction
 */
function generateContextualIntentPrediction(
  context: ConversationContext,
  currentMessage: string,
  semanticResult: any
): { predicted_intent: string; confidence: number; reasoning: string } {
  let adjustedConfidence = semanticResult.confidence;
  let reasoning = semanticResult.reasoning;
  
  // Context-based adjustments
  const recentIntents = context.messages
    .slice(-3)
    .filter(msg => msg.intent)
    .map(msg => msg.intent!);
  
  // Intent continuity boost
  if (recentIntents.includes(semanticResult.intent)) {
    adjustedConfidence += 0.1;
    reasoning += '; Context continuity boost applied';
  }
  
  // Language consistency check
  if (context.patterns.dominant_language === detectLanguage(currentMessage).primary_language) {
    adjustedConfidence += 0.05;
    reasoning += '; Language consistency boost';
  }
  
  // Common patterns boost
  if (context.patterns.common_intents.includes(semanticResult.intent)) {
    adjustedConfidence += 0.08;
    reasoning += '; Common pattern recognition';
  }
  
  return {
    predicted_intent: semanticResult.intent,
    confidence: Math.min(0.98, adjustedConfidence),
    reasoning
  };
}

/**
 * Generates contextual recommendations
 */
function generateContextualRecommendations(
  phase: string,
  urgency: string,
  satisfaction: string,
  context: ConversationContext
): ContextualInsight['recommendations'] {
  const recommendations: ContextualInsight['recommendations'] = {};
  
  // Escalation suggestions
  if (urgency === 'critical' || satisfaction === 'declining') {
    recommendations.escalation_suggestion = true;
  }
  
  // Personality override for different phases
  if (phase === 'escalation' || urgency === 'critical') {
    recommendations.personality_override = 'customer-support';
    recommendations.tone_adjustment = 'empathetic_urgent';
  } else if (phase === 'problem_solving') {
    recommendations.personality_override = 'technical';
    recommendations.tone_adjustment = 'patient_helpful';
  } else if (satisfaction === 'improving') {
    recommendations.tone_adjustment = 'positive_encouraging';
  }
  
  // Follow-up needs
  if (urgency === 'high' || urgency === 'critical') {
    recommendations.follow_up_needed = true;
  }
  
  return recommendations;
}

/**
 * Builds conversation context from message history
 */
export function buildConversationContext(
  messages: Array<{ role: string; content: string; timestamp: string; intent?: string; confidence?: number }>
): ConversationContext {
  // Analyze language patterns
  const languageAnalysis = analyzeLanguagePatterns(messages);
  
  // Extract intent patterns
  const intentPatterns = extractIntentPatterns(messages);
  
  // Build conversation flow
  const conversationFlow = messages
    .filter(msg => msg.intent)
    .map(msg => msg.intent!)
    .slice(-10); // Keep last 10 intents
  
  // Analyze user preferences
  const userPreferences = analyzeUserPreferences(messages);
  
  // Calculate session metadata
  const sessionMetadata = calculateSessionMetadata(messages);
  
  return {
    messages: messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      intent: msg.intent,
      confidence: msg.confidence
    })),
    patterns: {
      dominant_language: languageAnalysis.dominant,
      common_intents: intentPatterns.common,
      conversation_flow: conversationFlow,
      user_preferences: userPreferences
    },
    session_metadata: sessionMetadata
  };
}

/**
 * Analyzes language patterns in conversation
 */
function analyzeLanguagePatterns(messages: any[]): { dominant: 'ar' | 'en' | 'mixed' } {
  const languageCounts = { ar: 0, en: 0, mixed: 0 };
  
  messages
    .filter(msg => msg.role === 'user')
    .forEach(msg => {
      const detected = detectLanguage(msg.content);
      languageCounts[detected.primary_language]++;
    });
  
  const total = Object.values(languageCounts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return { dominant: 'en' };
  
  const dominant = Object.entries(languageCounts)
    .reduce((prev, current) => prev[1] > current[1] ? prev : current)[0] as 'ar' | 'en' | 'mixed';
  
  return { dominant };
}

/**
 * Extracts common intent patterns
 */
function extractIntentPatterns(messages: any[]): { common: string[] } {
  const intentCounts: { [key: string]: number } = {};
  
  messages
    .filter(msg => msg.intent)
    .forEach(msg => {
      intentCounts[msg.intent] = (intentCounts[msg.intent] || 0) + 1;
    });
  
  const common = Object.entries(intentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([intent]) => intent);
  
  return { common };
}

/**
 * Analyzes user preferences from conversation
 */
function analyzeUserPreferences(messages: any[]): {
  response_style: string;
  preferred_language: string;
  topic_interests: string[];
} {
  const userMessages = messages.filter(msg => msg.role === 'user');
  
  // Determine preferred language
  const languageAnalysis = analyzeLanguagePatterns(messages);
  
  // Analyze response style preference (formal vs casual)
  const formalIndicators = ['please', 'thank you', 'could you', 'من فضلك', 'شكرا لحضرتك'];
  const casualIndicators = ['hey', 'thanks', 'ازيك', 'يلا', 'طب'];
  
  let formalScore = 0;
  let casualScore = 0;
  
  userMessages.forEach(msg => {
    formalIndicators.forEach(indicator => {
      if (msg.content.toLowerCase().includes(indicator)) formalScore++;
    });
    casualIndicators.forEach(indicator => {
      if (msg.content.toLowerCase().includes(indicator)) casualScore++;
    });
  });
  
  const responseStyle = formalScore > casualScore ? 'formal' : 'casual';
  
  return {
    response_style: responseStyle,
    preferred_language: languageAnalysis.dominant,
    topic_interests: [] // Could be expanded to track topics
  };
}

/**
 * Calculates session metadata
 */
function calculateSessionMetadata(messages: any[]): {
  start_time: string;
  message_count: number;
  avg_response_time: number;
  satisfaction_indicators: number;
} {
  const startTime = messages.length > 0 ? messages[0].timestamp : new Date().toISOString();
  const messageCount = messages.length;
  
  // Calculate average response time (simplified)
  let totalResponseTime = 0;
  let responseCount = 0;
  
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === 'assistant' && messages[i-1].role === 'user') {
      const timeDiff = new Date(messages[i].timestamp).getTime() - 
                      new Date(messages[i-1].timestamp).getTime();
      totalResponseTime += timeDiff;
      responseCount++;
    }
  }
  
  const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
  
  // Simple satisfaction indicator
  const satisfactionIndicators = 0; // Would need more sophisticated analysis
  
  return {
    start_time: startTime,
    message_count: messageCount,
    avg_response_time: avgResponseTime,
    satisfaction_indicators: satisfactionIndicators
  };
}