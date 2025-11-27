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

/**
 * Extracts the real user phone number from WhatsApp message data
 *
 * This function handles two different addressing modes used by WhatsApp:
 * 1. Primary Number (PN): The user's main WhatsApp number
 * 2. Linked Device (LID): A secondary device linked to the main account
 *
 * In LID mode, the actual phone number is stored in remoteJidAlt instead of remoteJid.
 * This function intelligently detects the addressing mode and extracts the correct number.
 *
 * @param messageData - The complete WhatsApp message data object
 * @returns The extracted real phone number or null if not found
 *
 * @example
 * // Primary Number case (addressingMode: "pn")
 * extractRealUserPhone({
 *   key: {
 *     remoteJid: "201234567890@s.whatsapp.net",
 *     remoteJidAlt: "78477810262143@lid",
 *     addressingMode: "pn"
 *   }
 * })
 * // Returns: "201234567890"
 *
 * @example
 * // Linked Device case (addressingMode: "lid")
 * extractRealUserPhone({
 *   key: {
 *     remoteJid: "76931588431993@lid",
 *     remoteJidAlt: "201065662288@s.whatsapp.net",
 *     addressingMode: "lid"
 *   }
 * })
 * // Returns: "201065662288"
 */
export function extractRealUserPhone(messageData: any): string | null {
  try {
    const key = messageData?.key;

    if (!key) {
      return null;
    }

    const addressingMode = key.addressingMode;
    const remoteJid = key.remoteJid;
    const remoteJidAlt = key.remoteJidAlt;

    // 🔑 CRITICAL LOGIC: Handle Linked Device (LID) mode
    // In LID mode, the real phone number is in remoteJidAlt, not remoteJid
    if (addressingMode === 'lid' && remoteJidAlt) {
      const phoneNumber = remoteJidAlt
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .trim();

      if (phoneNumber) {
        return phoneNumber;
      }
    }

    // 🔑 FALLBACK: Handle Primary Number (PN) mode or when addressingMode is undefined
    // In PN mode or legacy messages, the real phone number is in remoteJid
    if (remoteJid) {
      const phoneNumber = remoteJid
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .trim();

      if (phoneNumber) {
        return phoneNumber;
      }
    }

    // 🔑 LAST RESORT: If remoteJid failed, try remoteJidAlt as final fallback
    if (remoteJidAlt) {
      const phoneNumber = remoteJidAlt
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .trim();

      if (phoneNumber) {
        return phoneNumber;
      }
    }

    // No valid phone number found
    return null;
  } catch (error) {
    // Safely handle any parsing errors
    console.error('Error extracting real user phone:', error);
    return null;
  }
}

/**
 * Checks if a message is from a WhatsApp group
 *
 * WhatsApp uses different JID suffixes to identify message types:
 * - Individual messages: remoteJid ends with @s.whatsapp.net or @lid
 * - Group messages: remoteJid ends with @g.us
 *
 * This function helps filter out group messages when the bot should only
 * respond to individual/direct messages.
 *
 * @param messageData - The WhatsApp message data object
 * @returns True if message is from a group, false if from an individual
 *
 * @example
 * // Individual message (PN mode)
 * isGroupMessage({
 *   key: {
 *     remoteJid: "201234567890@s.whatsapp.net"
 *   }
 * })
 * // Returns: false
 *
 * @example
 * // Individual message (LID mode)
 * isGroupMessage({
 *   key: {
 *     remoteJid: "76931588431993@lid"
 *   }
 * })
 * // Returns: false
 *
 * @example
 * // Group message
 * isGroupMessage({
 *   key: {
 *     remoteJid: "120363424526194005@g.us"
 *   }
 * })
 * // Returns: true
 */
export function isGroupMessage(messageData: any): boolean {
  try {
    const remoteJid = messageData?.key?.remoteJid;

    // Validate remoteJid exists and is a string
    if (!remoteJid || typeof remoteJid !== 'string') {
      return false;
    }

    // Group messages have remoteJid ending with @g.us
    // Individual messages end with @s.whatsapp.net or @lid
    return remoteJid.endsWith('@g.us');
  } catch (error) {
    // Safely handle any parsing errors
    console.error('Error checking if message is from group:', error);
    return false; // Default to treating as individual message if error occurs
  }
}
