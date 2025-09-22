import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNextOpenAIKey } from './openai-key-rotation.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

export interface CustomerProfile {
  id: string;
  whatsapp_instance_id: string;
  phone_number: string;
  name?: string;
  email?: string;
  company?: string;
  customer_stage: 'new' | 'interested' | 'customer' | 'loyal';
  tags: string[];
  conversation_summary?: string;
  key_points: any[];
  preferences: any;
  last_interaction?: string;
  first_interaction: string;
  total_messages: number;
  ai_interactions: number;
  metadata: any;
  created_at: string;
  updated_at: string;
  
  // AI-extracted insights
  customer_intent?: 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison';
  customer_mood?: 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused';
  urgency_level?: 'urgent' | 'high' | 'normal' | 'low';
  communication_style?: 'formal' | 'friendly' | 'direct' | 'detailed';
  journey_stage?: 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer';
}

export interface CustomerProfileUpdate {
  name?: string;
  email?: string;
  company?: string;
  customer_stage?: 'new' | 'interested' | 'customer' | 'loyal';
  tags?: string[];
  conversation_summary?: string;
  key_points?: any[];
  preferences?: any;
  metadata?: any;
  total_messages?: number;
  ai_interactions?: number;
  
  // AI-extracted insights
  customer_intent?: 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison';
  customer_mood?: 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused';
  urgency_level?: 'urgent' | 'high' | 'normal' | 'low';
  communication_style?: 'formal' | 'friendly' | 'direct' | 'detailed';
  journey_stage?: 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer';
}

export class CustomerProfileManager {
  private supabaseAdmin: any;

  constructor(supabaseAdmin: any) {
    this.supabaseAdmin = supabaseAdmin;
  }

  /**
   * Get existing customer profile
   */
  async getProfile(instanceId: string, phoneNumber: string): Promise<CustomerProfile | null> {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('customer_profiles')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .eq('phone_number', phoneNumber)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw error;
      }

      return data as CustomerProfile;
    } catch (error) {
      logger.error('Error getting customer profile:', error);
      throw error;
    }
  }

  /**
   * Create new customer profile
   */
  async createProfile(instanceId: string, phoneNumber: string): Promise<CustomerProfile> {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('customer_profiles')
        .insert({
          whatsapp_instance_id: instanceId,
          phone_number: phoneNumber,
          customer_stage: 'new',
          tags: [],
          key_points: [],
          preferences: {},
          total_messages: 0,
          ai_interactions: 0,
          metadata: {},
          last_interaction: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      logger.info('✅ Created new customer profile', {
        instanceId,
        phoneNumber,
        profileId: data.id
      });

      return data as CustomerProfile;
    } catch (error) {
      logger.error('Error creating customer profile:', error);
      throw error;
    }
  }

  /**
   * Get or create customer profile
   */
  async getOrCreateProfile(instanceId: string, phoneNumber: string): Promise<CustomerProfile> {
    try {
      // Try to get existing profile
      let profile = await this.getProfile(instanceId, phoneNumber);
      
      if (!profile) {
        // Create new profile if doesn't exist
        profile = await this.createProfile(instanceId, phoneNumber);
      }
      
      return profile;
    } catch (error) {
      logger.error('Error in getOrCreateProfile:', error);
      throw error;
    }
  }

  /**
   * Update customer profile
   */
  async updateProfile(
    instanceId: string, 
    phoneNumber: string, 
    updates: CustomerProfileUpdate
  ): Promise<CustomerProfile> {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('customer_profiles')
        .update({
          ...updates,
          last_interaction: new Date().toISOString()
        })
        .eq('whatsapp_instance_id', instanceId)
        .eq('phone_number', phoneNumber)
        .select()
        .single();

      if (error) throw error;

      logger.debug('Customer profile updated', {
        instanceId,
        phoneNumber,
        updates: Object.keys(updates)
      });

      return data as CustomerProfile;
    } catch (error) {
      logger.error('Error updating customer profile:', error);
      throw error;
    }
  }

  /**
   * Add key point to customer profile
   */
  async addKeyPoint(instanceId: string, phoneNumber: string, point: string): Promise<void> {
    try {
      // Get current profile
      const profile = await this.getOrCreateProfile(instanceId, phoneNumber);
      
      // Add new key point if not already exists
      const keyPoints = profile.key_points || [];
      if (!keyPoints.includes(point)) {
        keyPoints.push({
          point,
          timestamp: new Date().toISOString()
        });

        // Keep only last 10 key points
        const limitedKeyPoints = keyPoints.slice(-10);

        await this.updateProfile(instanceId, phoneNumber, {
          key_points: limitedKeyPoints
        });

        logger.debug('Added key point to customer profile', {
          instanceId,
          phoneNumber,
          point: point.substring(0, 50)
        });
      }
    } catch (error) {
      logger.error('Error adding key point:', error);
      throw error;
    }
  }

  /**
   * Update customer stage
   */
  async updateCustomerStage(
    instanceId: string, 
    phoneNumber: string, 
    stage: 'new' | 'interested' | 'customer' | 'loyal'
  ): Promise<void> {
    try {
      await this.updateProfile(instanceId, phoneNumber, {
        customer_stage: stage
      });

      logger.info('Updated customer stage', {
        instanceId,
        phoneNumber,
        newStage: stage
      });
    } catch (error) {
      logger.error('Error updating customer stage:', error);
      throw error;
    }
  }

  /**
   * Increment message counters
   */
  async incrementMessageCounters(instanceId: string, phoneNumber: string): Promise<void> {
    try {
      const profile = await this.getOrCreateProfile(instanceId, phoneNumber);
      
      await this.updateProfile(instanceId, phoneNumber, {
        total_messages: (profile.total_messages || 0) + 1,
        ai_interactions: (profile.ai_interactions || 0) + 1
      });
    } catch (error) {
      logger.error('Error incrementing message counters:', error);
      throw error;
    }
  }

  /**
   * Update conversation summary
   */
  async updateConversationSummary(
    instanceId: string, 
    phoneNumber: string, 
    summary: string
  ): Promise<void> {
    try {
      await this.updateProfile(instanceId, phoneNumber, {
        conversation_summary: summary
      });

      logger.debug('Updated conversation summary', {
        instanceId,
        phoneNumber,
        summaryLength: summary.length
      });
    } catch (error) {
      logger.error('Error updating conversation summary:', error);
      throw error;
    }
  }

  /**
   * Get last 5 customer messages for context
   */
  private async getLastCustomerMessages(instanceId: string, phoneNumber: string): Promise<string[]> {
    try {
      const { data: conversations, error: convError } = await this.supabaseAdmin
        .from('whatsapp_conversations')
        .select('id')
        .eq('instance_id', instanceId)
        .eq('user_phone', phoneNumber)
        .single();

      if (convError || !conversations) {
        logger.debug('No conversation found for customer', { instanceId, phoneNumber });
        return [];
      }

      const { data: messages, error: msgError } = await this.supabaseAdmin
        .from('whatsapp_conversation_messages')
        .select('content')
        .eq('conversation_id', conversations.id)
        .eq('role', 'user')
        .order('timestamp', { ascending: false })
        .limit(5);

      if (msgError) {
        logger.error('Error fetching customer messages:', msgError);
        return [];
      }

      // Return messages in chronological order (oldest first)
      return messages ? messages.reverse().map(msg => msg.content) : [];
    } catch (error) {
      logger.error('Error getting last customer messages:', error);
      return [];
    }
  }

  /**
   * Extract customer info using GPT-5-nano AI with conversation context
   */
  private async extractWithAI(instanceId: string, phoneNumber: string, currentMessage: string): Promise<CustomerProfileUpdate> {
    try {
      const apiKey = getNextOpenAIKey();
      
      // Get current profile for context
      const currentProfile = await this.getProfile(instanceId, phoneNumber);
      
      // Get conversation history for better context
      const recentMessages = await this.getLastCustomerMessages(instanceId, phoneNumber);
      
      const conversationContext = recentMessages.length > 0 
        ? `\nRecent conversation history (oldest to newest):\n${recentMessages.map((msg, i) => `${i+1}. ${msg}`).join('\n')}`
        : '';
      
      const currentContext = currentProfile 
        ? `\nCurrent customer profile:\n- Stage: ${currentProfile.customer_stage}\n- Intent: ${currentProfile.customer_intent || 'unknown'}\n- Journey: ${currentProfile.journey_stage || 'unknown'}\n- Name: ${currentProfile.name || 'unknown'}`
        : '';

      const prompt = `You are analyzing a customer conversation to extract information and insights. Use the conversation context to make better decisions.
${currentContext}${conversationContext}

Current message: "${currentMessage}"

BUSINESS LOGIC RULES:
1. If customer mentions buying/purchasing/subscribing → customer_stage should be "customer" or "loyal"
2. If customer asks about products/services → customer_stage should be "interested" 
3. If customer has problems/complaints → customer_intent should be "support" or "complaint"
4. If customer mentions specific purchase → journey_stage should be "existing_customer"
5. Always consider the conversation history when determining customer_stage

Extract and return ONLY a JSON object with these fields (set to null if not found or unchanged):
{
  "name": "customer name",
  "email": "email address", 
  "company": "company name",
  "customer_stage": "new|interested|customer|loyal",
  "customer_intent": "purchase|inquiry|support|complaint|comparison",
  "customer_mood": "happy|frustrated|neutral|excited|confused",
  "urgency_level": "urgent|high|normal|low",
  "communication_style": "formal|friendly|direct|detailed",
  "journey_stage": "first_time|researching|ready_to_buy|existing_customer"
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "gpt-5-nano",
          messages: [
            { role: 'user', content: prompt }
          ],
          reasoning_effort: 'low',
          max_completion_tokens: 5000,
          temperature: 1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = (data.choices[0].message.content || '{}').replace(/^```(?:json)?\s*|\s*```$/g, '');
      const extractedInfo = JSON.parse(content);
      
      // Clean up the extracted data
      const updates: CustomerProfileUpdate = {};
      
      // Basic info
      if (extractedInfo.name && extractedInfo.name !== null) {
        updates.name = extractedInfo.name.trim();
      }
      if (extractedInfo.email && extractedInfo.email !== null) {
        updates.email = extractedInfo.email.trim();
      }
      if (extractedInfo.company && extractedInfo.company !== null) {
        updates.company = extractedInfo.company.trim();
      }
      
      // AI insights
      if (extractedInfo.customer_intent && extractedInfo.customer_intent !== null) {
        updates.customer_intent = extractedInfo.customer_intent;
      }
      if (extractedInfo.customer_mood && extractedInfo.customer_mood !== null) {
        updates.customer_mood = extractedInfo.customer_mood;
      }
      if (extractedInfo.urgency_level && extractedInfo.urgency_level !== null) {
        updates.urgency_level = extractedInfo.urgency_level;
      }
      if (extractedInfo.communication_style && extractedInfo.communication_style !== null) {
        updates.communication_style = extractedInfo.communication_style;
      }
      if (extractedInfo.journey_stage && extractedInfo.journey_stage !== null) {
        updates.journey_stage = extractedInfo.journey_stage;
      }

      return updates;
    } catch (error) {
      logger.warn('AI extraction failed, skipping:', error);
      return {};
    }
  }

  /**
   * Apply automatic business logic rules to extracted data
   */
  private applyBusinessLogic(updates: CustomerProfileUpdate): CustomerProfileUpdate {
    const enhanced = { ...updates };

    // Rule 1: If customer_intent is "purchase" → upgrade customer_stage
    if (enhanced.customer_intent === 'purchase') {
      if (!enhanced.customer_stage || enhanced.customer_stage === 'new' || enhanced.customer_stage === 'interested') {
        enhanced.customer_stage = 'customer';
        logger.debug('Applied business rule: purchase intent → customer stage');
      }
      // Also update journey stage for purchase
      if (!enhanced.journey_stage || enhanced.journey_stage === 'first_time' || enhanced.journey_stage === 'researching') {
        enhanced.journey_stage = 'existing_customer';
        logger.debug('Applied business rule: purchase intent → existing customer journey');
      }
    }

    // Rule 2: If customer_intent is "support" or "complaint" → customer likely exists
    if (enhanced.customer_intent === 'support' || enhanced.customer_intent === 'complaint') {
      if (!enhanced.customer_stage || enhanced.customer_stage === 'new') {
        enhanced.customer_stage = 'customer';
        logger.debug('Applied business rule: support/complaint → customer stage');
      }
      if (!enhanced.journey_stage || enhanced.journey_stage === 'first_time') {
        enhanced.journey_stage = 'existing_customer';
        logger.debug('Applied business rule: support/complaint → existing customer journey');
      }
    }

    // Rule 3: If journey_stage is "existing_customer" → customer_stage should be at least "customer"
    if (enhanced.journey_stage === 'existing_customer') {
      if (!enhanced.customer_stage || enhanced.customer_stage === 'new' || enhanced.customer_stage === 'interested') {
        enhanced.customer_stage = 'customer';
        logger.debug('Applied business rule: existing customer journey → customer stage');
      }
    }

    // Rule 4: If journey_stage is "ready_to_buy" → customer_stage should be "interested"
    if (enhanced.journey_stage === 'ready_to_buy') {
      if (!enhanced.customer_stage || enhanced.customer_stage === 'new') {
        enhanced.customer_stage = 'interested';
        logger.debug('Applied business rule: ready to buy → interested stage');
      }
    }

    // Rule 5: If customer has a name but stage is still "new" → upgrade to "interested"
    if (enhanced.name && (!enhanced.customer_stage || enhanced.customer_stage === 'new')) {
      enhanced.customer_stage = 'interested';
      logger.debug('Applied business rule: customer provided name → interested stage');
    }

    return enhanced;
  }

  /**
   * Extract and update customer info from message using AI
   */
  async extractAndUpdateCustomerInfo(
    instanceId: string, 
    phoneNumber: string, 
    message: string
  ): Promise<void> {
    try {
      // Use AI to extract customer information with full context
      const updates = await this.extractWithAI(instanceId, phoneNumber, message);

      if (Object.keys(updates).length > 0) {
        // Apply automatic business logic rules
        const enhancedUpdates = this.applyBusinessLogic(updates);
        
        await this.updateProfile(instanceId, phoneNumber, enhancedUpdates);
        
        logger.info('🤖 AI extracted customer info from message', {
          instanceId,
          phoneNumber,
          extractedFields: Object.keys(enhancedUpdates),
          aiExtracted: Object.keys(updates),
          businessRulesApplied: Object.keys(enhancedUpdates).filter(key => !updates.hasOwnProperty(key)),
          messagePreview: message.substring(0, 50)
        });
      }
    } catch (error) {
      logger.error('Error extracting customer info:', error);
      // Don't throw here, this is optional functionality
    }
  }

  /**
   * Get enhanced context for AI including customer profile
   */
  async getEnhancedContext(instanceId: string, phoneNumber: string): Promise<string> {
    try {
      const profile = await this.getOrCreateProfile(instanceId, phoneNumber);
      
      let context = '';
      
      // Add customer name if available
      if (profile.name) {
        context += `Customer Name: ${profile.name}\n`;
      }
      
      // Add customer stage
      context += `Customer Stage: ${profile.customer_stage}\n`;
      
      // Add key points if available
      if (profile.key_points && profile.key_points.length > 0) {
        context += `Key Points:\n${profile.key_points.map((kp: any) => `- ${typeof kp === 'string' ? kp : kp.point}`).join('\n')}\n`;
      }
      
      // Add conversation summary if available
      if (profile.conversation_summary) {
        context += `Previous Conversation Summary: ${profile.conversation_summary}\n`;
      }
      
      // Add interaction stats
      context += `Total Messages: ${profile.total_messages}, Interactions: ${profile.ai_interactions}\n`;
      
      return context;
    } catch (error) {
      logger.error('Error getting enhanced context:', error);
      return '';
    }
  }
}