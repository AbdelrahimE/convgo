
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import logDebug from "./webhook-logger.ts";

// Initialize Supabase admin client (this will be available in edge functions)
const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  // Log the environment variables (without revealing full key)
  const maskedKey = supabaseServiceKey ? 
    `${supabaseServiceKey.substring(0, 5)}...${supabaseServiceKey.substring(supabaseServiceKey.length - 5)}` : 
    'NOT SET';
  
  console.log(`[DEBUG] Supabase URL: ${supabaseUrl}, Service Key: ${maskedKey ? 'Available' : 'Missing'}`);
  
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
    await logDebug('CONNECTION_STATUS_START', `Starting connection status processing for ${instanceName}`, { 
      instanceName,
      statusDataKeys: Object.keys(statusData),
      hasData: !!statusData.data
    });

    // Extract the actual status data from the nested structure if needed
    const stateData = statusData.data || statusData;
    
    await logDebug('CONNECTION_STATUS_DATA', `Extracted state data`, { 
      state: stateData.state, 
      statusReason: stateData.statusReason,
      raw: JSON.stringify(stateData).substring(0, 500)
    });
    
    // Map the webhook status to database status values using the exact values from EVOLUTION API
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
    
    await logDebug('CONNECTION_STATUS_MAPPING', `Mapped webhook state '${stateData.state}' to database status '${dbStatus}'`);
    
    // Find the instance in the database
    await logDebug('CONNECTION_STATUS_DB_FIND', `Finding instance in database with name: ${instanceName}`);
    
    const supabaseAdmin = getSupabaseAdmin();
    const { data: instanceData, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, status')
      .eq('instance_name', instanceName)
      .maybeSingle();
      
    if (instanceError) {
      await logDebug('CONNECTION_STATUS_ERROR', `Instance not found: ${instanceName}`, { 
        error: instanceError,
        errorMessage: instanceError.message,
        errorDetails: JSON.stringify(instanceError)
      });
      return false;
    }
    
    if (!instanceData) {
      await logDebug('CONNECTION_STATUS_NOT_FOUND', `No instance found with name: ${instanceName}`);
      return false;
    }
    
    await logDebug('CONNECTION_STATUS_INSTANCE_FOUND', `Found instance in database`, { 
      instanceId: instanceData.id, 
      currentStatus: instanceData.status,
      newStatus: dbStatus
    });
    
    // Prepare the update data
    const updateData: any = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };
    
    // If connecting to CONNECTED state, update the last_connected timestamp
    if (dbStatus === 'CONNECTED') {
      updateData.last_connected = new Date().toISOString();
      
      // If profile data is available, store it in the instance record
      if (stateData.profileName || stateData.profilePictureUrl) {
        // Create or update metadata object
        const metadata = instanceData.metadata || {};
        metadata.profile = {
          name: stateData.profileName || metadata.profile?.name,
          pictureUrl: stateData.profilePictureUrl || metadata.profile?.pictureUrl,
          lastUpdated: new Date().toISOString()
        };
        updateData.metadata = metadata;
        
        await logDebug('CONNECTION_STATUS_PROFILE', `Updating profile information`, {
          profileName: stateData.profileName,
          hasProfilePicture: !!stateData.profilePictureUrl
        });
      }
    }
    
    await logDebug('CONNECTION_STATUS_UPDATE_PREP', `Preparing to update instance status`, { 
      instanceId: instanceData.id,
      updateData: JSON.stringify(updateData)
    });
    
    // Log the status transition
    await logDebug('CONNECTION_STATUS_TRANSITION', `Instance ${instanceName} status changing from ${instanceData.status} to ${dbStatus}`, {
      previousStatus: instanceData.status,
      newStatus: dbStatus,
      statusReason: stateData.statusReason,
      instanceId: instanceData.id
    });
    
    // Update the instance record
    try {
      const { error: updateError } = await supabaseAdmin
        .from('whatsapp_instances')
        .update(updateData)
        .eq('id', instanceData.id);
        
      if (updateError) {
        await logDebug('CONNECTION_STATUS_UPDATE_ERROR', `Failed to update instance status`, { 
          error: updateError,
          errorMessage: updateError.message,
          errorDetails: JSON.stringify(updateError),
          updateData: JSON.stringify(updateData)
        });
        return false;
      }
      
      await logDebug('CONNECTION_STATUS_UPDATED', `Successfully updated status for instance ${instanceName} to ${dbStatus}`);
      return true;
    } catch (updateError) {
      await logDebug('CONNECTION_STATUS_UPDATE_EXCEPTION', `Exception during update operation`, { 
        error: updateError,
        errorMessage: updateError instanceof Error ? updateError.message : String(updateError),
        errorStack: updateError instanceof Error ? updateError.stack : 'No stack trace',
        instanceId: instanceData.id
      });
      return false;
    }
    
  } catch (error) {
    await logDebug('CONNECTION_STATUS_EXCEPTION', `Exception processing connection status`, { 
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      instanceName
    });
    console.error('Error in processConnectionStatus:', error);
    return false;
  }
}
