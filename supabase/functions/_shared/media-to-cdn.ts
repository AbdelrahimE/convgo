/**
 * Media to CDN Processor - المعالج المركزي لرفع الوسائط إلى BunnyCDN
 *
 * هذا الملف يحتوي على الدالة الرئيسية لمعالجة جميع أنواع الوسائط:
 * 1. استدعاء Evolution API للحصول على base64
 * 2. تحويل base64 → Buffer
 * 3. رفع Buffer إلى BunnyCDN
 * 4. إرجاع رابط CDN النهائي
 */

import { MediaType, getFileExtension } from './media-detector.ts';

// Create a simple logger
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * نتيجة معالجة الوسائط
 */
export interface MediaProcessResult {
  success: boolean;
  cdnUrl?: string;
  error?: string;
  metadata?: {
    fileName: string;
    mimeType: string;
    fileSize?: number;
    processingTime?: number;
  };
}

/**
 * استدعاء Evolution API للحصول على base64
 *
 * @param messageKeyId معرف الرسالة
 * @param instanceName اسم الـ instance
 * @param evolutionApiUrl رابط Evolution API
 * @param evolutionApiKey مفتاح Evolution API
 * @returns البيانات من Evolution API
 */
async function fetchMediaBase64(
  messageKeyId: string,
  instanceName: string,
  evolutionApiUrl: string,
  evolutionApiKey: string
): Promise<{ base64: string; mimeType: string; fileName: string } | null> {
  try {
    const url = `${evolutionApiUrl}/chat/getBase64FromMediaMessage/${instanceName}`;

    logger.info('📡 Fetching media from Evolution API', {
      url,
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      instanceName
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        message: {
          key: {
            id: messageKeyId
          }
        },
        convertToMp4: true // تحويل الفيديوهات إلى mp4 إذا لزم الأمر
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Evolution API request failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 200)
      });
      return null;
    }

    const data = await response.json();

    // التحقق من وجود base64
    if (!data.base64) {
      logger.error('❌ Evolution API returned no base64 data', {
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : []
      });
      return null;
    }

    logger.info('✅ Media base64 fetched successfully', {
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      mimeType: data.mimetype,
      fileName: data.fileName,
      base64Length: data.base64.length,
      fileSize: data.size?.fileLength?.low || 0
    });

    return {
      base64: data.base64,
      mimeType: data.mimetype || 'application/octet-stream',
      fileName: data.fileName || `${messageKeyId}.bin`
    };

  } catch (error) {
    logger.error('❌ Error fetching media from Evolution API', {
      error: error instanceof Error ? error.message : String(error),
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

/**
 * تحويل base64 إلى Buffer
 *
 * @param base64 النص المشفر بـ base64
 * @returns Buffer أو null في حالة الفشل
 */
function base64ToBuffer(base64: string): Uint8Array | null {
  try {
    // إزالة أي prefix من base64 (مثل: data:image/jpeg;base64,)
    const cleanBase64 = base64.replace(/^data:.*;base64,/, '');

    // تحويل base64 إلى binary string
    const binaryString = atob(cleanBase64);

    // إنشاء Uint8Array من binary string
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    logger.debug('✅ Base64 converted to buffer', {
      base64Length: base64.length,
      bufferSize: bytes.length
    });

    return bytes;
  } catch (error) {
    logger.error('❌ Error converting base64 to buffer', {
      error: error instanceof Error ? error.message : String(error),
      base64Length: base64?.length || 0
    });
    return null;
  }
}

/**
 * رفع Buffer إلى BunnyCDN Storage
 *
 * @param buffer البيانات المراد رفعها
 * @param fileName اسم الملف
 * @param instanceName اسم الـ instance (للمجلد)
 * @param storageZoneName اسم الـ Storage Zone
 * @param storagePassword كلمة مرور الـ Storage Zone
 * @param storageRegion منطقة الـ Storage (اختياري)
 * @returns true في حالة النجاح
 */
async function uploadToBunnyCDN(
  buffer: Uint8Array,
  fileName: string,
  instanceName: string,
  storageZoneName: string,
  storagePassword: string,
  storageRegion?: string
): Promise<boolean> {
  try {
    // تحديد endpoint حسب المنطقة
    const region = storageRegion || 'storage.bunnycdn.com';

    // بناء المسار: /{storageZoneName}/{instanceName}/{fileName}
    const filePath = `${storageZoneName}/${instanceName}/${fileName}`;
    const url = `https://${region}/${filePath}`;

    logger.info('📤 Uploading to BunnyCDN', {
      url,
      fileName,
      instanceName,
      fileSize: buffer.length,
      storageZone: storageZoneName,
      region
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'AccessKey': storagePassword,
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length.toString()
      },
      body: buffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ BunnyCDN upload failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 200),
        url,
        fileSize: buffer.length
      });
      return false;
    }

    logger.info('✅ File uploaded to BunnyCDN successfully', {
      fileName,
      fileSize: buffer.length,
      status: response.status
    });

    return true;

  } catch (error) {
    logger.error('❌ Error uploading to BunnyCDN', {
      error: error instanceof Error ? error.message : String(error),
      fileName,
      fileSize: buffer.length,
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * الدالة الرئيسية: معالجة الوسائط ورفعها إلى CDN
 *
 * @param messageKeyId معرف الرسالة (message.key.id)
 * @param instanceName اسم الـ instance
 * @param mediaType نوع الوسائط (اختياري - للتسمية فقط)
 * @param fileName اسم الملف (اختياري)
 * @returns نتيجة المعالجة مع رابط CDN
 */
export async function processMediaToCDN(
  messageKeyId: string,
  instanceName: string,
  mediaType?: MediaType,
  fileName?: string
): Promise<MediaProcessResult> {
  const startTime = Date.now();

  try {
    logger.info('🚀 Starting media processing to CDN', {
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      instanceName,
      mediaType,
      fileName
    });

    // الحصول على المتغيرات البيئية
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const storageZoneName = Deno.env.get('BUNNYCDN_STORAGE_ZONE_NAME');
    const storagePassword = Deno.env.get('BUNNYCDN_STORAGE_PASSWORD');
    const storageRegion = Deno.env.get('BUNNYCDN_STORAGE_REGION'); // اختياري
    const pullZoneUrl = Deno.env.get('BUNNYCDN_PULL_ZONE_URL');

    // التحقق من المتغيرات الضرورية
    if (!evolutionApiUrl || !evolutionApiKey) {
      logger.error('❌ Missing Evolution API configuration');
      return {
        success: false,
        error: 'Missing Evolution API configuration (EVOLUTION_API_URL or EVOLUTION_API_KEY)'
      };
    }

    if (!storageZoneName || !storagePassword || !pullZoneUrl) {
      logger.error('❌ Missing BunnyCDN configuration');
      return {
        success: false,
        error: 'Missing BunnyCDN configuration (BUNNYCDN_STORAGE_ZONE_NAME, BUNNYCDN_STORAGE_PASSWORD, or BUNNYCDN_PULL_ZONE_URL)'
      };
    }

    // الخطوة 1: الحصول على base64 من Evolution API
    const mediaData = await fetchMediaBase64(
      messageKeyId,
      instanceName,
      evolutionApiUrl,
      evolutionApiKey
    );

    if (!mediaData) {
      return {
        success: false,
        error: 'Failed to fetch media from Evolution API'
      };
    }

    // الخطوة 2: تحويل base64 إلى Buffer
    const buffer = base64ToBuffer(mediaData.base64);

    if (!buffer) {
      return {
        success: false,
        error: 'Failed to convert base64 to buffer'
      };
    }

    // الخطوة 3: رفع إلى BunnyCDN
    const finalFileName = fileName || mediaData.fileName;

    const uploadSuccess = await uploadToBunnyCDN(
      buffer,
      finalFileName,
      instanceName,
      storageZoneName,
      storagePassword,
      storageRegion
    );

    if (!uploadSuccess) {
      return {
        success: false,
        error: 'Failed to upload to BunnyCDN'
      };
    }

    // الخطوة 4: بناء رابط CDN النهائي
    // تنظيف pullZoneUrl من الـ trailing slash
    const cleanPullZoneUrl = pullZoneUrl.replace(/\/$/, '');
    const cdnUrl = `${cleanPullZoneUrl}/${instanceName}/${finalFileName}`;

    const processingTime = Date.now() - startTime;

    logger.info('✅ Media processed and uploaded to CDN successfully', {
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      cdnUrl,
      fileName: finalFileName,
      fileSize: buffer.length,
      processingTime: `${processingTime}ms`
    });

    return {
      success: true,
      cdnUrl,
      metadata: {
        fileName: finalFileName,
        mimeType: mediaData.mimeType,
        fileSize: buffer.length,
        processingTime
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error('❌ Error processing media to CDN', {
      error: error instanceof Error ? error.message : String(error),
      messageKeyId: messageKeyId.substring(0, 10) + '...',
      processingTime: `${processingTime}ms`,
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: `Exception during processing: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
