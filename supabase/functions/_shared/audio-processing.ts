
/**
 * Extracts audio details from a WhatsApp message
 * @param message The WhatsApp message object containing audio data
 * @returns Structured audio details or null if not a valid audio message
 */
export function extractAudioDetails(message: any): {
  audioUrl?: string;
  mimeType?: string;
  duration?: number;
  pttFlag?: boolean;
  mediaKey?: string;
  fileEncSha256?: string;
} | null {
  try {
    // Check if this is an audio message
    if (!message?.message?.audioMessage) {
      return null;
    }

    const audioMessage = message.message.audioMessage;
    
    return {
      audioUrl: audioMessage.url || undefined,
      mimeType: audioMessage.mimetype || 'audio/ogg; codecs=opus',
      duration: audioMessage.seconds || 0,
      pttFlag: audioMessage.ptt || false,
      mediaKey: audioMessage.mediaKey || undefined,
      fileEncSha256: audioMessage.fileEncSha256 || undefined
    };
  } catch (error) {
    console.error('Error extracting audio details:', error);
    return null;
  }
}
