
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import logDebug from "./webhook-logger.ts";

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
    
    await logDebug('CONNECTION_STATUS_UPDATE', `Processing connection status update for instance ${instanceName}`, { 
      state: stateData.state, 
      statusReason: stateData.statusReason 
    });
    
    // Map the webhook status to database status values
    let dbStatus: string;
    switch (stateData.state) {
      case 'open':
        dbStatus = 'CONNECTED';
        break;
      case 'connecting':
        dbStatus = 'CONNECTING';
        break;
      case 'close':
        dbStatus = 'DISCONNECTED';
        break;
      default:
        dbStatus = 'UNKNOWN';
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
      await logDebug('CONNECTION_STATUS_ERROR', `Instance not found: ${instanceName}`, { error: instanceError });
      return false;
    }
    
    // Prepare the update data
    const updateData: any = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };
    
    // If connecting to CONNECTED state, update the last_connected timestamp
    if (dbStatus === 'CONNECTED') {
      updateData.last_connected = new Date().toISOString();
    }
    
    // Log the status transition
    await logDebug('CONNECTION_STATUS_TRANSITION', `Instance ${instanceName} status changing from ${instanceData.status} to ${dbStatus}`, {
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
      await logDebug('CONNECTION_STATUS_UPDATE_ERROR', `Failed to update instance status`, { error: updateError });
      return false;
    }
    
    await logDebug('CONNECTION_STATUS_UPDATED', `Successfully updated status for instance ${instanceName} to ${dbStatus}`);
    return true;
    
  } catch (error) {
    await logDebug('CONNECTION_STATUS_EXCEPTION', `Exception processing connection status`, { error, instanceName });
    console.error('Error in processConnectionStatus:', error);
    return false;
  }
}
