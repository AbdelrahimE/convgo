
/**
 * Utility function to detect if a webhook payload is a connection status event
 */

/**
 * Detects if a webhook payload is a connection status event
 * @param data The webhook payload data
 * @returns boolean indicating whether this is a connection status event
 */
export function isConnectionStatusEvent(data: any): boolean {
  // Log incoming data structure for debugging
  console.log('CONNECTION_DETECTOR_INPUT', JSON.stringify(data, null, 2));
  
  // Check if this is a standard connection event
  if (data && data.event === 'connection.update') {
    console.log('CONNECTION_DETECTOR: Detected via event property');
    return true;
  }
  
  // Or directly check for state property in data or nested data
  const stateData = data?.data || data;
  
  // Log the extracted state data for debugging
  console.log('CONNECTION_DETECTOR_STATE_DATA', JSON.stringify(stateData, null, 2));
  
  const isConnectionEvent = (
    data &&
    typeof stateData?.state === 'string' &&
    typeof stateData?.instance === 'string' &&
    ['open', 'connecting', 'close'].includes(stateData.state)
  );
  
  console.log('CONNECTION_DETECTOR_RESULT', isConnectionEvent, {
    hasState: typeof stateData?.state === 'string',
    stateValue: stateData?.state,
    hasInstance: typeof stateData?.instance === 'string',
    isValidState: stateData?.state ? ['open', 'connecting', 'close'].includes(stateData.state) : false
  });
  
  return isConnectionEvent;
}
