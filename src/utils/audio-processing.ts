
/**
 * Extracts audio details from WhatsApp message data
 * 
 * @param messageData The WhatsApp message data object
 * @returns Object containing audio details (url, mediaKey, duration, mimeType, ptt)
 */
export function extractAudioDetails(messageData: any): { 
  url: string | null; 
  mediaKey: string | null;
  duration: number | null;
  mimeType: string | null;
  ptt: boolean;
} {
  // Check for audioMessage object
  const audioMessage = messageData?.message?.audioMessage;
  if (audioMessage) {
    return {
      url: audioMessage.url || null,
      mediaKey: audioMessage.mediaKey || null,
      duration: audioMessage.seconds || null,
      mimeType: audioMessage.mimetype || 'audio/ogg; codecs=opus',
      ptt: audioMessage.ptt || false
    };
  }
  
  // Check for pttMessage object (Push To Talk - voice messages)
  const pttMessage = messageData?.message?.pttMessage;
  if (pttMessage) {
    return {
      url: pttMessage.url || null,
      mediaKey: pttMessage.mediaKey || null,
      duration: pttMessage.seconds || null,
      mimeType: pttMessage.mimetype || 'audio/ogg; codecs=opus',
      ptt: true
    };
  }
  
  // No audio content found
  return {
    url: null,
    mediaKey: null,
    duration: null,
    mimeType: null,
    ptt: false
  };
}

/**
 * Determines if a WhatsApp message contains audio content
 * 
 * @param messageData The WhatsApp message data object
 * @returns Boolean indicating if the message contains audio
 */
export function hasAudioContent(messageData: any): boolean {
  return (
    messageData?.message?.audioMessage || 
    (messageData?.messageType === 'audioMessage') ||
    (messageData?.message?.pttMessage)
  );
}
