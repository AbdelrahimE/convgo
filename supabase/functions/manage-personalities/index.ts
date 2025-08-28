import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface PersonalityRequest {
  action: 'list' | 'create' | 'update' | 'delete' | 'get_templates' | 'clone_template';
  whatsappInstanceId?: string;
  userId?: string;
  personalityId?: string;
  data?: {
    name?: string;
    description?: string;
    system_prompt?: string;
    temperature?: number;
    model?: string;
    intent_categories?: string[];
    is_active?: boolean;
    is_default?: boolean;
    priority?: number;
    process_voice_messages?: boolean;
    voice_message_default_response?: string;
    default_voice_language?: string;
  };
  templateId?: string;
}

// Get user ID from JWT token
async function getUserIdFromToken(token: string): Promise<string | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch (error) {
    logger.error('Error extracting user ID from token:', error);
    return null;
  }
}

// List personalities for a WhatsApp instance
async function listPersonalities(userId: string, whatsappInstanceId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_personalities')
      .select(`
        id, name, description, system_prompt, temperature, model,
        intent_categories, is_active, is_default, priority,
        process_voice_messages, voice_message_default_response, 
        default_voice_language, usage_count,
        created_at, updated_at
      `)
      .eq('user_id', userId)
      .eq('whatsapp_instance_id', whatsappInstanceId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, personalities: data || [] };
  } catch (error) {
    logger.error('Error listing personalities:', error);
    return { success: false, error: error.message };
  }
}

// Create a new personality
async function createPersonality(userId: string, whatsappInstanceId: string, data: any) {
  try {
    // If this is being set as default, unset other defaults first
    if (data.is_default) {
      await supabaseAdmin
        .from('ai_personalities')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('whatsapp_instance_id', whatsappInstanceId);
    }

    const { data: newPersonality, error } = await supabaseAdmin
      .from('ai_personalities')
      .insert({
        whatsapp_instance_id: whatsappInstanceId,
        user_id: userId,
        name: data.name,
        description: data.description,
        system_prompt: data.system_prompt,
        temperature: data.temperature || 0.7,
        model: data.model || 'gpt-4o-mini',
        intent_categories: data.intent_categories || [],
        is_active: data.is_active !== undefined ? data.is_active : true,
        is_default: data.is_default || false,
        priority: data.priority || 1,
        process_voice_messages: data.process_voice_messages !== undefined ? data.process_voice_messages : true,
        voice_message_default_response: data.voice_message_default_response,
        default_voice_language: data.default_voice_language || 'en'
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, personality: newPersonality };
  } catch (error) {
    logger.error('Error creating personality:', error);
    return { success: false, error: error.message };
  }
}

// Update an existing personality
async function updatePersonality(userId: string, personalityId: string, data: any) {
  try {
    // If this is being set as default, unset other defaults first
    if (data.is_default) {
      const { data: currentPersonality } = await supabaseAdmin
        .from('ai_personalities')
        .select('whatsapp_instance_id')
        .eq('id', personalityId)
        .eq('user_id', userId)
        .single();

      if (currentPersonality) {
        await supabaseAdmin
          .from('ai_personalities')
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('whatsapp_instance_id', currentPersonality.whatsapp_instance_id);
      }
    }

    const { data: updatedPersonality, error } = await supabaseAdmin
      .from('ai_personalities')
      .update({
        name: data.name,
        description: data.description,
        system_prompt: data.system_prompt,
        temperature: data.temperature,
        model: data.model,
        intent_categories: data.intent_categories,
        is_active: data.is_active,
        is_default: data.is_default,
        priority: data.priority,
        process_voice_messages: data.process_voice_messages,
        voice_message_default_response: data.voice_message_default_response,
        default_voice_language: data.default_voice_language
      })
      .eq('id', personalityId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, personality: updatedPersonality };
  } catch (error) {
    logger.error('Error updating personality:', error);
    return { success: false, error: error.message };
  }
}

// Delete a personality
async function deletePersonality(userId: string, personalityId: string) {
  try {
    // Check if this is the default personality
    const { data: personality } = await supabaseAdmin
      .from('ai_personalities')
      .select('is_default, whatsapp_instance_id')
      .eq('id', personalityId)
      .eq('user_id', userId)
      .single();

    if (personality?.is_default) {
      // Can't delete the default personality, set another one as default first
      const { data: alternatives } = await supabaseAdmin
        .from('ai_personalities')
        .select('id')
        .eq('user_id', userId)
        .eq('whatsapp_instance_id', personality.whatsapp_instance_id)
        .neq('id', personalityId)
        .eq('is_active', true)
        .limit(1);

      if (alternatives && alternatives.length > 0) {
        await supabaseAdmin
          .from('ai_personalities')
          .update({ is_default: true })
          .eq('id', alternatives[0].id);
      } else {
        return { success: false, error: 'Cannot delete the only active personality. Create another personality first.' };
      }
    }

    const { error } = await supabaseAdmin
      .from('ai_personalities')
      .delete()
      .eq('id', personalityId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    logger.error('Error deleting personality:', error);
    return { success: false, error: error.message };
  }
}

// Get system personality templates
async function getTemplates() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_personalities')
      .select(`
        id, name, description, system_prompt, temperature, model,
        intent_categories, process_voice_messages, 
        voice_message_default_response, default_voice_language,
        template_category
      `)
      .eq('is_template', true)
      .eq('is_active', true)
      .order('template_category')
      .order('name');

    if (error) throw error;
    return { success: true, templates: data || [] };
  } catch (error) {
    logger.error('Error getting templates:', error);
    return { success: false, error: error.message };
  }
}

// Clone a template personality
async function cloneTemplate(userId: string, whatsappInstanceId: string, templateId: string) {
  try {
    const { data: template, error: templateError } = await supabaseAdmin
      .from('ai_personalities')
      .select('*')
      .eq('id', templateId)
      .eq('is_template', true)
      .single();

    if (templateError || !template) {
      return { success: false, error: 'Template not found' };
    }

    const { data: newPersonality, error } = await supabaseAdmin
      .from('ai_personalities')
      .insert({
        whatsapp_instance_id: whatsappInstanceId,
        user_id: userId,
        name: template.name,
        description: template.description,
        system_prompt: template.system_prompt,
        temperature: template.temperature,
        model: template.model,
        intent_categories: template.intent_categories,
        is_active: true,
        is_default: false, // Templates are never default when cloned
        priority: template.priority,
        process_voice_messages: template.process_voice_messages,
        voice_message_default_response: template.voice_message_default_response,
        default_voice_language: template.default_voice_language,
        is_template: false, // Cloned personalities are not templates
        template_category: null
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, personality: newPersonality };
  } catch (error) {
    logger.error('Error cloning template:', error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, whatsappInstanceId, personalityId, data, templateId } = await req.json() as PersonalityRequest;

    // Get user ID from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authorization token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      );
    }

    let result;

    switch (action) {
      case 'list':
        if (!whatsappInstanceId) {
          return new Response(
            JSON.stringify({ success: false, error: 'whatsappInstanceId required for list action' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await listPersonalities(userId, whatsappInstanceId);
        break;

      case 'create':
        if (!whatsappInstanceId || !data) {
          return new Response(
            JSON.stringify({ success: false, error: 'whatsappInstanceId and data required for create action' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await createPersonality(userId, whatsappInstanceId, data);
        break;

      case 'update':
        if (!personalityId || !data) {
          return new Response(
            JSON.stringify({ success: false, error: 'personalityId and data required for update action' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await updatePersonality(userId, personalityId, data);
        break;

      case 'delete':
        if (!personalityId) {
          return new Response(
            JSON.stringify({ success: false, error: 'personalityId required for delete action' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await deletePersonality(userId, personalityId);
        break;

      case 'get_templates':
        result = await getTemplates();
        break;

      case 'clone_template':
        if (!whatsappInstanceId || !templateId) {
          return new Response(
            JSON.stringify({ success: false, error: 'whatsappInstanceId and templateId required for clone_template action' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await cloneTemplate(userId, whatsappInstanceId, templateId);
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Error in manage-personalities function:', error);
    
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