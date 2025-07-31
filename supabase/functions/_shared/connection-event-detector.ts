
/**
 * Utility function to detect if a webhook payload is a connection status event
 */

/**
 * Detects if a webhook payload is a connection status event
 * @param data The webhook payload data
 * @returns boolean indicating whether this is a connection status event
 */
export function isConnectionStatusEvent(data: any): boolean {
  // Check if this is a standard connection event
  if (data && data.event === 'connection.update') {
    return true;
  }
  
  // Or directly check for state property in data or nested data
  const stateData = data?.data || data;
  return (
    data &&
    typeof stateData?.state === 'string' &&
    typeof stateData?.instance === 'string' &&
    ['open', 'connecting', 'close'].includes(stateData.state)
  );
}
