
/**
 * Utility function to detect if a webhook payload is a connection status event
 */

/**
 * Detects if a webhook payload is a connection status event
 * @param data The webhook payload data
 * @returns boolean indicating whether this is a connection status event
 */
export function isConnectionStatusEvent(data: any): boolean {
  // For debugging, log the structure of data
  console.log("Checking if payload is a connection event:", {
    hasEvent: !!data?.event,
    eventType: data?.event,
    hasData: !!data?.data,
    hasDataState: !!data?.data?.state,
    state: data?.data?.state,
    hasInstance: !!data?.instance || !!data?.data?.instance
  });
  
  // Check if this is a standard connection event with the exact format from EVOLUTION API
  if (data && data.event === 'connection.update') {
    console.log("✅ Identified connection.update event by event field");
    return true;
  }
  
  // Check for the specific state formats in the data structure
  const stateData = data?.data || data;
  
  // If we have a state field with the right values and an instance field, it's a connection event
  if (
    data &&
    typeof stateData?.state === 'string' &&
    typeof stateData?.instance === 'string' &&
    ['open', 'connecting', 'close'].includes(stateData.state)
  ) {
    console.log(`✅ Identified connection event by state: ${stateData.state}`);
    return true;
  }
  
  console.log("❌ Not a connection event");
  return false;
}
