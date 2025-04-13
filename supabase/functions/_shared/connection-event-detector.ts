
/**
 * Utility function to detect if a webhook payload is a connection status event
 */

/**
 * Detects if a webhook payload is a connection status event
 * @param data The webhook payload data
 * @returns boolean indicating whether this is a connection status event
 */
export function isConnectionStatusEvent(data: any): boolean {
  // Check if this is a standard connection event with the exact format from EVOLUTION API
  if (data && data.event === 'connection.update') {
    return true;
  }
  
  // Check for the specific state formats in the data structure
  const stateData = data?.data || data;
  return (
    data &&
    typeof stateData?.state === 'string' &&
    typeof stateData?.instance === 'string' &&
    ['open', 'connecting', 'close'].includes(stateData.state)
  );
}

