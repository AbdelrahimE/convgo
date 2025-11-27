/**
 * Media Detector - دوال للكشف عن الوسائط واستخراج المعلومات
 *
 * هذا الملف يوفر دوال بسيطة للكشف عن وجود وسائط في رسائل الواتساب
 * واستخراج المعلومات الأساسية المطلوبة لمعالجتها
 */

// Create a simple logger
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * أنواع الوسائط المدعومة
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

/**
 * معلومات الوسائط المستخرجة
 */
export interface MediaInfo {
  messageKeyId: string;
  mediaType: MediaType;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}

/**
 * فحص إذا كانت الرسالة تحتوي على وسائط
 *
 * @param messageData بيانات الرسالة من الـ webhook
 * @returns true إذا كانت الرسالة تحتوي على وسائط
 */
export function hasMediaContent(messageData: any): boolean {
  if (!messageData || !messageData.message) {
    return false;
  }

  const message = messageData.message;

  // فحص جميع أنواع الوسائط المدعومة
  return !!(
    message.imageMessage ||
    message.videoMessage ||
    message.audioMessage ||
    message.documentMessage ||
    message.stickerMessage ||
    message.pttMessage || // رسائل صوتية (Push To Talk)
    messageData.messageType === 'imageMessage' ||
    messageData.messageType === 'videoMessage' ||
    messageData.messageType === 'audioMessage' ||
    messageData.messageType === 'documentMessage' ||
    messageData.messageType === 'stickerMessage'
  );
}

/**
 * استخراج message.key.id من بيانات الرسالة
 *
 * @param messageData بيانات الرسالة من الـ webhook
 * @returns معرف الرسالة أو null إذا لم يتم العثور عليه
 */
export function extractMessageKeyId(messageData: any): string | null {
  try {
    // محاولة استخراج من المسار الأساسي
    if (messageData?.key?.id) {
      return messageData.key.id;
    }

    // محاولة استخراج من المسار البديل (في حالة التغليف)
    if (messageData?.data?.key?.id) {
      return messageData.data.key.id;
    }

    logger.warn('⚠️ Could not extract message.key.id from message data', {
      hasKey: !!messageData?.key,
      hasDataKey: !!messageData?.data?.key,
      messageDataKeys: messageData ? Object.keys(messageData) : []
    });

    return null;
  } catch (error) {
    logger.error('❌ Error extracting message.key.id', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * تحديد نوع الوسائط من بيانات الرسالة
 *
 * @param messageData بيانات الرسالة من الـ webhook
 * @returns نوع الوسائط أو null إذا لم يتم العثور على وسائط
 */
export function getMediaType(messageData: any): MediaType | null {
  if (!messageData || !messageData.message) {
    return null;
  }

  const message = messageData.message;

  // ترتيب الأولوية: الصور > الفيديو > الصوت > المستندات > الملصقات
  if (message.imageMessage || messageData.messageType === 'imageMessage') {
    return 'image';
  }

  if (message.videoMessage || messageData.messageType === 'videoMessage') {
    return 'video';
  }

  if (message.audioMessage || message.pttMessage || messageData.messageType === 'audioMessage') {
    return 'audio';
  }

  if (message.documentMessage || messageData.messageType === 'documentMessage') {
    return 'document';
  }

  if (message.stickerMessage || messageData.messageType === 'stickerMessage') {
    return 'sticker';
  }

  return null;
}

/**
 * استخراج امتداد الملف من mimeType
 *
 * @param mimeType نوع MIME
 * @returns امتداد الملف (مثل: jpg, mp4, pdf)
 */
export function getFileExtension(mimeType: string): string {
  const mimeMap: { [key: string]: string } = {
    // الصور
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',

    // الفيديو
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
    'video/webm': 'webm',

    // الصوت
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg; codecs=opus': 'ogg',

    // المستندات
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
  };

  return mimeMap[mimeType] || 'bin';
}

/**
 * استخراج معلومات الوسائط الكاملة من بيانات الرسالة
 *
 * @param messageData بيانات الرسالة من الـ webhook
 * @returns معلومات الوسائط أو null إذا لم يتم العثور على وسائط
 */
export function extractMediaInfo(messageData: any): MediaInfo | null {
  try {
    // التحقق من وجود وسائط
    if (!hasMediaContent(messageData)) {
      return null;
    }

    // استخراج message.key.id
    const messageKeyId = extractMessageKeyId(messageData);
    if (!messageKeyId) {
      logger.error('❌ Cannot extract media info: missing message.key.id');
      return null;
    }

    // تحديد نوع الوسائط
    const mediaType = getMediaType(messageData);
    if (!mediaType) {
      logger.error('❌ Cannot extract media info: unknown media type');
      return null;
    }

    // استخراج التفاصيل الإضافية
    const message = messageData.message;
    let mimeType: string | undefined;
    let caption: string | undefined;
    let fileName: string | undefined;

    // استخراج التفاصيل حسب نوع الوسائط
    if (mediaType === 'image' && message.imageMessage) {
      mimeType = message.imageMessage.mimetype;
      caption = message.imageMessage.caption;
      fileName = `${messageKeyId}.${getFileExtension(mimeType || 'image/jpeg')}`;
    } else if (mediaType === 'video' && message.videoMessage) {
      mimeType = message.videoMessage.mimetype;
      caption = message.videoMessage.caption;
      fileName = `${messageKeyId}.${getFileExtension(mimeType || 'video/mp4')}`;
    } else if (mediaType === 'audio' && (message.audioMessage || message.pttMessage)) {
      const audioMsg = message.audioMessage || message.pttMessage;
      mimeType = audioMsg.mimetype;
      fileName = `${messageKeyId}.${getFileExtension(mimeType || 'audio/ogg')}`;
    } else if (mediaType === 'document' && message.documentMessage) {
      mimeType = message.documentMessage.mimetype;
      caption = message.documentMessage.caption;
      fileName = message.documentMessage.fileName || `${messageKeyId}.${getFileExtension(mimeType || 'application/pdf')}`;
    } else if (mediaType === 'sticker' && message.stickerMessage) {
      mimeType = message.stickerMessage.mimetype;
      fileName = `${messageKeyId}.${getFileExtension(mimeType || 'image/webp')}`;
    }

    const mediaInfo: MediaInfo = {
      messageKeyId,
      mediaType,
      fileName,
      mimeType,
      caption
    };

    logger.info('✅ Media info extracted successfully', {
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      mediaType,
      fileName,
      mimeType,
      hasCaption: !!caption
    });

    return mediaInfo;

  } catch (error) {
    logger.error('❌ Error extracting media info', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}
