import { getRedisClient, safeRedisCommand } from './upstash-client.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Buffer configuration
const BUFFER_DELAY_MS = 8000; // 8 seconds
const BUFFER_TTL_SECONDS = 15; // 15 seconds total TTL as safety
const TIMER_TTL_SECONDS = 10; // 10 seconds for timer keys

// Interfaces for buffer data
interface BufferedMessage {
  text: string;
  timestamp: string;
  messageId: string;
  messageData: any; // Store complete message data for processing
}

interface MessageBuffer {
  instanceName: string;
  userPhone: string;
  messages: BufferedMessage[];
  firstMessageAt: string;
  lastMessageAt: string;
  processed: boolean;
}

interface ProcessingTimer {
  bufferId: string;
  scheduledAt: string;
  processing: boolean;
}

/**
 * Generate buffer key for a user
 */
function getBufferKey(instanceName: string, userPhone: string): string {
  return `msg_buffer:${instanceName}:${userPhone}`;
}

/**
 * Generate timer key for a user
 */
function getTimerKey(instanceName: string, userPhone: string): string {
  return `msg_timer:${instanceName}:${userPhone}`;
}

/**
 * Safely parse Redis data that might be auto-serialized
 */
function safeParseRedisData<T>(data: any): T | null {
  try {
    if (data === null || data === undefined) {
      return null;
    }
    
    // If it's already an object, return it directly (auto-deserialized)
    if (typeof data === 'object') {
      return data as T;
    }
    
    // If it's a string, try to parse it
    if (typeof data === 'string') {
      return JSON.parse(data) as T;
    }
    
    logger.warn('Unexpected Redis data type:', typeof data);
    return null;
  } catch (error) {
    logger.error('Error parsing Redis data:', error);
    return null;
  }
}

/**
 * Add a message to the buffer
 */
export async function addMessageToBuffer(
  instanceName: string,
  userPhone: string,
  messageText: string,
  messageId: string,
  messageData: any
): Promise<{ success: boolean; bufferCreated: boolean; fallbackToImmediate: boolean }> {
  try {
    const bufferKey = getBufferKey(instanceName, userPhone);
    const timestamp = new Date().toISOString();
    
    logger.info('Adding message to buffer', {
      instanceName,
      userPhone,
      messagePreview: messageText?.substring(0, 50) + '...',
      bufferKey
    });

    // Create new message object
    const newMessage: BufferedMessage = {
      text: messageText,
      timestamp,
      messageId,
      messageData
    };

    // Try to get existing buffer
    const existingBuffer = await safeRedisCommand(
      async (client) => {
        const data = await client.get(bufferKey);
        return safeParseRedisData<MessageBuffer>(data);
      },
      null
    );

    let buffer: MessageBuffer;
    let bufferCreated = false;

    if (existingBuffer && !existingBuffer.processed) {
      // Add to existing buffer
      buffer = {
        ...existingBuffer,
        messages: [...existingBuffer.messages, newMessage],
        lastMessageAt: timestamp
      };
      
      logger.info('Added message to existing buffer', {
        bufferKey,
        totalMessages: buffer.messages.length,
        timespan: new Date(timestamp).getTime() - new Date(existingBuffer.firstMessageAt).getTime()
      });
    } else {
      // Create new buffer
      buffer = {
        instanceName,
        userPhone,
        messages: [newMessage],
        firstMessageAt: timestamp,
        lastMessageAt: timestamp,
        processed: false
      };
      
      bufferCreated = true;
      logger.info('Created new message buffer', { bufferKey });
    }

    // Store the updated buffer
    const stored = await safeRedisCommand(
      async (client) => {
        await client.setex(bufferKey, BUFFER_TTL_SECONDS, buffer);
        return true;
      },
      false
    );

    if (!stored) {
      logger.warn('Failed to store buffer in Redis, falling back to immediate processing');
      return { success: false, bufferCreated: false, fallbackToImmediate: true };
    }

    return { success: true, bufferCreated, fallbackToImmediate: false };
  } catch (error) {
    logger.error('Error adding message to buffer:', error);
    return { success: false, bufferCreated: false, fallbackToImmediate: true };
  }
}

/**
 * Schedule delayed processing for a buffer
 */
export async function scheduleDelayedProcessing(
  instanceName: string,
  userPhone: string
): Promise<{ success: boolean; alreadyScheduled: boolean }> {
  try {
    const timerKey = getTimerKey(instanceName, userPhone);
    const bufferId = getBufferKey(instanceName, userPhone);
    
    // Check if timer already exists
    const existingTimer = await safeRedisCommand(
      async (client) => {
        const data = await client.get(timerKey);
        return safeParseRedisData<ProcessingTimer>(data);
      },
      null
    );

    if (existingTimer && !existingTimer.processing) {
      logger.info('Timer already scheduled for buffer', {
        timerKey,
        scheduledAt: existingTimer.scheduledAt
      });
      return { success: true, alreadyScheduled: true };
    }

    // Create new timer
    const timer: ProcessingTimer = {
      bufferId,
      scheduledAt: new Date().toISOString(),
      processing: false
    };

    const scheduled = await safeRedisCommand(
      async (client) => {
        await client.setex(timerKey, TIMER_TTL_SECONDS, timer);
        return true;
      },
      false
    );

    if (!scheduled) {
      logger.warn('Failed to schedule delayed processing timer');
      return { success: false, alreadyScheduled: false };
    }

    // Schedule the actual processing (this will be called from an external scheduler)
    logger.info('Delayed processing scheduled', {
      timerKey,
      bufferId,
      delayMs: BUFFER_DELAY_MS
    });

    return { success: true, alreadyScheduled: false };
  } catch (error) {
    logger.error('Error scheduling delayed processing:', error);
    return { success: false, alreadyScheduled: false };
  }
}

/**
 * Get buffered messages for processing
 */
export async function getBufferedMessages(
  instanceName: string,
  userPhone: string
): Promise<{ buffer: MessageBuffer | null; success: boolean }> {
  try {
    const bufferKey = getBufferKey(instanceName, userPhone);
    
    const buffer = await safeRedisCommand(
      async (client) => {
        const data = await client.get(bufferKey);
        return safeParseRedisData<MessageBuffer>(data);
      },
      null
    );

    if (!buffer) {
      logger.info('No buffer found for user', { bufferKey });
      return { buffer: null, success: true };
    }

    if (buffer.processed) {
      logger.info('Buffer already processed', { bufferKey });
      return { buffer: null, success: true };
    }

    logger.info('Retrieved buffer for processing', {
      bufferKey,
      messageCount: buffer.messages.length,
      timespan: new Date(buffer.lastMessageAt).getTime() - new Date(buffer.firstMessageAt).getTime()
    });

    return { buffer, success: true };
  } catch (error) {
    logger.error('Error getting buffered messages:', error);
    return { buffer: null, success: false };
  }
}

/**
 * Mark buffer as processed and clean up
 */
export async function markBufferAsProcessed(
  instanceName: string,
  userPhone: string
): Promise<boolean> {
  try {
    const bufferKey = getBufferKey(instanceName, userPhone);
    const timerKey = getTimerKey(instanceName, userPhone);
    
    logger.info('Marking buffer as processed and cleaning up', {
      bufferKey,
      timerKey
    });

    // Mark buffer as processed and clean up timer
    await safeRedisCommand(
      async (client) => {
        // Update buffer to mark as processed
        const bufferData = await client.get(bufferKey);
        if (bufferData) {
          const buffer = safeParseRedisData<MessageBuffer>(bufferData);
          if (buffer) {
            buffer.processed = true;
            await client.setex(bufferKey, 30, buffer); // Keep for 30 seconds for debugging
          }
        }
        
        // Clean up timer
        await client.del(timerKey);
        
        return true;
      },
      false
    );

    return true;
  } catch (error) {
    logger.error('Error marking buffer as processed:', error);
    return false;
  }
}

/**
 * Check if buffering is enabled and working
 */
export async function isBufferingAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    // Quick connection test
    await client.ping();
    return true;
  } catch (error) {
    logger.warn('Buffering not available:', error);
    return false;
  }
}

/**
 * Schedule delayed processing via HTTP call
 */
export async function scheduleDelayedProcessingViaHTTP(
  instanceName: string,
  userPhone: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  try {
    logger.info('Scheduling delayed processing via HTTP', {
      instanceName,
      userPhone,
      delayMs: BUFFER_DELAY_MS
    });

    // Use setTimeout to delay the HTTP call
    setTimeout(async () => {
      try {
        logger.info('Executing delayed processing HTTP call', {
          instanceName,
          userPhone
        });

        const response = await fetch(`${supabaseUrl}/functions/v1/process-buffered-messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            instanceName,
            userPhone
          })
        });

        if (response.ok) {
          const result = await response.json();
          logger.info('Delayed processing completed successfully', {
            instanceName,
            userPhone,
            result
          });
        } else {
          const errorText = await response.text();
          logger.error('Delayed processing failed', {
            instanceName,
            userPhone,
            status: response.status,
            error: errorText
          });
        }
      } catch (error) {
        logger.error('Exception in delayed processing HTTP call', {
          instanceName,
          userPhone,
          error
        });
      }
    }, BUFFER_DELAY_MS);

    return true;
  } catch (error) {
    logger.error('Error scheduling delayed processing:', error);
    return false;
  }
}

/**
 * Combine multiple messages into a single coherent message
 */
export function combineBufferedMessages(messages: BufferedMessage[]): string {
  if (messages.length === 0) {
    return '';
  }

  if (messages.length === 1) {
    return messages[0].text;
  }

  // Sort messages by timestamp to ensure correct order
  const sortedMessages = messages
    .filter(msg => msg.text && msg.text.trim().length > 0)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (sortedMessages.length === 0) {
    return '';
  }

  if (sortedMessages.length === 1) {
    return sortedMessages[0].text;
  }

  // Combine messages with clear separation
  const combinedText = sortedMessages
    .map(msg => msg.text.trim())
    .join(' ');

  logger.info('Combined buffered messages', {
    originalCount: messages.length,
    processedCount: sortedMessages.length,
    combinedLength: combinedText.length,
    preview: combinedText.substring(0, 100) + '...'
  });

  return combinedText;
}