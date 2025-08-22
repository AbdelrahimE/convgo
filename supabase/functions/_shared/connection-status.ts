
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Initialize Supabase admin client (this will be available in edge functions)
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Process connection status updates from webhook
 * @param instanceName The name of the WhatsApp instance
 * @param statusData The status data from the webhook
 * @returns Promise<boolean> Success status
 */
export async function processConnectionStatus(instanceName: string, statusData: any) {
  try {
    // Extract the actual status data from the nested structure if needed
    // The statusData could either be directly the state object or nested in a data property
    const stateData = statusData.data || statusData;
    
    logger.info(`Processing connection status update for instance ${instanceName}`, { 
      state: stateData.state, 
      statusReason: stateData.statusReason 
    });
    
    // Map the webhook status to database status values
    let dbStatus: string;
    switch (stateData.state) {
      case 'open':
        dbStatus = 'Connected';
        break;
      case 'connecting':
        dbStatus = 'Connecting';
        break;
      case 'close':
        dbStatus = 'Disconnected';
        break;
      default:
        dbStatus = 'Unknown';
        break;
    }
    
    // Find the instance in the database
    const supabaseAdmin = getSupabaseAdmin();
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .maybeSingle();
      
    if (instanceError) {
      logger.error(`Instance not found: ${instanceName}`, { error: instanceError });
      return false;
    }
    
    // Prepare the update data
    const updateData: any = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };
    
    // If connecting to Connected state, update the last_connected timestamp
    if (dbStatus === 'Connected') {
      updateData.last_connected = new Date().toISOString();
    }
    
    // Log the status transition
    logger.info(`Instance ${instanceName} status changing from ${instanceData.status} to ${dbStatus}`, {
      previousStatus: instanceData.status,
      newStatus: dbStatus,
      statusReason: stateData.statusReason,
      instanceId: instanceData.id
    });
    
    // Update the instance record
    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_instances')
      .update(updateData)
      .eq('id', instanceData.id);
      
    if (updateError) {
      logger.error(`Failed to update instance status`, { error: updateError });
      return false;
    }
    
    logger.info(`Successfully updated status for instance ${instanceName} to ${dbStatus}`);
    return true;
    
  } catch (error) {
    logger.error(`Exception processing connection status`, { error, instanceName });
    console.error('Error in processConnectionStatus:', error);
    return false;
  }
}
