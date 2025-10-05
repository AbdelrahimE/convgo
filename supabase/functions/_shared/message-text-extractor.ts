/**
 * Message Text Extractor
 *
 * Centralized utility for extracting message text from WhatsApp message data.
 * Supports regular messages, quoted messages (replies), and media with captions.
 *
 * @module message-text-extractor
 */

/**
 * Extracts the main message text from various message types
 *
 * @param messageData - The WhatsApp message data object
 * @returns The extracted text or empty string if no text found
 */
function extractMainMessageText(messageData: any): string {
  // Priority 1: Transcribed text from voice messages (already processed)
  if (messageData.transcribedText && typeof messageData.transcribedText === 'string') {
    return messageData.transcribedText.trim();
  }

  // Priority 2: Regular text conversation
  if (messageData.message?.conversation) {
    return messageData.message.conversation.trim();
  }

  // Priority 3: Extended text message
  if (messageData.message?.extendedTextMessage?.text) {
    return messageData.message.extendedTextMessage.text.trim();
  }

  // Priority 4: Image caption
  if (messageData.message?.imageMessage?.caption) {
    return messageData.message.imageMessage.caption.trim();
  }

  // Priority 5: Video caption
  if (messageData.message?.videoMessage?.caption) {
    return messageData.message.videoMessage.caption.trim();
  }

  // Priority 6: Document caption
  if (messageData.message?.documentMessage?.caption) {
    return messageData.message.documentMessage.caption.trim();
  }

  // No text content found
  return '';
}

/**
 * Extracts quoted message text from contextInfo
 *
 * @param messageData - The WhatsApp message data object
 * @returns The quoted message text or null if no quoted message
 */
function extractQuotedMessageText(messageData: any): string | null {
  const quotedMessage = messageData.contextInfo?.quotedMessage;

  if (!quotedMessage) {
    return null;
  }

  // Try to extract text from various quoted message types
  let quotedText = '';

  // Regular conversation in quoted message
  if (quotedMessage.conversation) {
    quotedText = quotedMessage.conversation.trim();
  }
  // Extended text in quoted message
  else if (quotedMessage.extendedTextMessage?.text) {
    quotedText = quotedMessage.extendedTextMessage.text.trim();
  }
  // Image caption in quoted message
  else if (quotedMessage.imageMessage?.caption) {
    quotedText = quotedMessage.imageMessage.caption.trim();
  }
  // Video caption in quoted message
  else if (quotedMessage.videoMessage?.caption) {
    quotedText = quotedMessage.videoMessage.caption.trim();
  }
  // Document caption in quoted message
  else if (quotedMessage.documentMessage?.caption) {
    quotedText = quotedMessage.documentMessage.caption.trim();
  }

  return quotedText || null;
}

/**
 * Main function: Extracts complete message text including quoted messages
 *
 * This function intelligently combines the main message with any quoted message
 * to provide full context to the AI system. The format clearly indicates when
 * a message is a reply to a previous message.
 *
 * @param messageData - The complete WhatsApp message data object
 * @returns The extracted message text with quoted context if applicable
 *
 * @example
 * // Regular message
 * extractMessageText({
 *   message: { conversation: "Hello" }
 * })
 * // Returns: "Hello"
 *
 * @example
 * // Reply message
 * extractMessageText({
 *   message: { conversation: "Yes, I agree" },
 *   contextInfo: {
 *     quotedMessage: { conversation: "Do you want to proceed?" }
 *   }
 * })
 * // Returns: "[Replying to: "Do you want to proceed?"]\nYes, I agree"
 */
export function extractMessageText(messageData: any): string {
  // Extract the main message text
  const mainText = extractMainMessageText(messageData);

  // Extract quoted message text (if exists)
  const quotedText = extractQuotedMessageText(messageData);

  // If we have both main text and quoted text, combine them with clear context
  if (quotedText && mainText) {
    return `[Replying to: "${quotedText}"]\n${mainText}`;
  }

  // If we only have main text, return it
  if (mainText) {
    return mainText;
  }

  // If we have quoted text but no main text (rare case - maybe just forwarded)
  if (quotedText) {
    return `[Quoted message: "${quotedText}"]`;
  }

  // No text content found - likely a media message without caption
  return '[Media Message]';
}

/**
 * Helper function to check if message has text content
 *
 * @param messageData - The WhatsApp message data object
 * @returns True if message contains any extractable text
 */
export function hasTextContent(messageData: any): boolean {
  const mainText = extractMainMessageText(messageData);
  return mainText.length > 0;
}

/**
 * Helper function to check if message is a reply
 *
 * @param messageData - The WhatsApp message data object
 * @returns True if message is replying to another message
 */
export function isReplyMessage(messageData: any): boolean {
  const quotedText = extractQuotedMessageText(messageData);
  return quotedText !== null && quotedText.length > 0;
}
