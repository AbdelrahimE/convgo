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
const BUFFER_TTL_SECONDS = 60; // 60 seconds total TTL for better safety margin
const TIMER_TTL_SECONDS = 30; // 30 seconds for timer keys
const PROCESSED_BUFFER_TTL = 300; // 5 minutes for processed buffers (debugging)
const GRACE_PERIOD_MS = 2000; // 2 seconds grace period after window

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
  processedAt?: string; // Optional: timestamp when buffer was processed
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
  const lockKey = `lock:buffer:${instanceName}:${userPhone}`;
  let lockAcquired = false;
  
  try {
    const bufferKey = getBufferKey(instanceName, userPhone);
    const timestamp = new Date().toISOString();
    
    logger.info('Adding message to buffer', {
      instanceName,
      userPhone,
      messagePreview: messageText?.substring(0, 50) + '...',
      bufferKey
    });

    // Try to acquire lock with retry logic
    const maxLockRetries = 3;
    for (let i = 0; i < maxLockRetries; i++) {
      lockAcquired = await acquireLock(lockKey, 3000); // 3 second lock timeout
      
      if (lockAcquired) {
        logger.debug('Lock acquired on attempt', { attempt: i + 1, lockKey });
        break;
      }
      
      if (i < maxLockRetries - 1) {
        // Wait a bit before retrying
        const waitTime = 50 * (i + 1); // Progressive backoff: 50ms, 100ms, 150ms
        logger.debug('Failed to acquire lock, retrying', { 
          attempt: i + 1, 
          waitTime,
          lockKey 
        });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // If we couldn't get the lock after retries, still try to proceed but log warning
    if (!lockAcquired) {
      logger.warn('Could not acquire lock after retries, proceeding without lock', { 
        lockKey,
        maxRetries: maxLockRetries 
      });
    }

    // Create new message object
    const newMessage: BufferedMessage = {
      text: messageText,
      timestamp,
      messageId,
      messageData
    };

    // Try to get existing buffer
    let existingBuffer = await safeRedisCommand(
      async (client) => {
        const data = await client.get(bufferKey);
        return safeParseRedisData<MessageBuffer>(data);
      },
      null
    );

    let buffer: MessageBuffer;
    let bufferCreated = false;

    // Check if we need to handle race condition near window end
    if (existingBuffer && !existingBuffer.processed) {
      // Calculate buffer age
      const bufferAge = Date.now() - new Date(existingBuffer.firstMessageAt).getTime();
      
      // If buffer is near the end of the window (between 7.5 and 8.5 seconds)
      if (bufferAge >= 7500 && bufferAge <= (BUFFER_DELAY_MS + 500)) {
        logger.info('Buffer near processing window, applying grace period', {
          bufferAge,
          bufferKey,
          gracePeriod: GRACE_PERIOD_MS
        });
        
        // Wait for a short grace period
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Re-check the buffer state
        existingBuffer = await safeRedisCommand(
          async (client) => {
            const data = await client.get(bufferKey);
            return safeParseRedisData<MessageBuffer>(data);
          },
          null
        );
        
        if (existingBuffer?.processed) {
          logger.info('Buffer was processed during grace period, will create new buffer');
          existingBuffer = null; // Force new buffer creation
        }
      }
    }

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
      // Create new buffer (either doesn't exist or was processed)
      buffer = {
        instanceName,
        userPhone,
        messages: [newMessage],
        firstMessageAt: timestamp,
        lastMessageAt: timestamp,
        processed: false
      };
      
      bufferCreated = true;
      logger.info('Created new message buffer', { 
        bufferKey,
        reason: existingBuffer?.processed ? 'previous buffer processed' : 'no existing buffer'
      });
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
  } finally {
    // Always release the lock if we acquired it
    if (lockAcquired) {
      const released = await releaseLock(lockKey);
      if (released) {
        logger.debug('Lock released successfully', { lockKey });
      } else {
        logger.warn('Failed to release lock', { lockKey });
      }
    }
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
  const lockKey = `lock:buffer:${instanceName}:${userPhone}`;
  let lockAcquired = false;
  
  try {
    const bufferKey = getBufferKey(instanceName, userPhone);
    const timerKey = getTimerKey(instanceName, userPhone);
    
    logger.info('Marking buffer as processed and cleaning up', {
      bufferKey,
      timerKey
    });
    
    // Try to acquire lock
    lockAcquired = await acquireLock(lockKey, 3000);
    if (!lockAcquired) {
      // Try once more after a short wait
      await new Promise(resolve => setTimeout(resolve, 100));
      lockAcquired = await acquireLock(lockKey, 3000);
      
      if (!lockAcquired) {
        logger.warn('Could not acquire lock for marking buffer as processed, proceeding anyway', { lockKey });
      }
    }

    // Mark buffer as processed and clean up timer
    await safeRedisCommand(
      async (client) => {
        // Update buffer to mark as processed
        const bufferData = await client.get(bufferKey);
        if (bufferData) {
          const buffer = safeParseRedisData<MessageBuffer>(bufferData);
          if (buffer) {
            buffer.processed = true;
            buffer.processedAt = new Date().toISOString(); // Track when it was processed
            await client.setex(bufferKey, PROCESSED_BUFFER_TTL, buffer); // Keep for 5 minutes for debugging
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
  } finally {
    // Always release the lock if we acquired it
    if (lockAcquired) {
      const released = await releaseLock(lockKey);
      if (released) {
        logger.debug('Lock released after marking buffer as processed', { lockKey });
      } else {
        logger.warn('Failed to release lock after marking buffer', { lockKey });
      }
    }
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
 * Save processing status to Redis for tracking
 */
async function saveProcessingStatus(
  instanceName: string,
  userPhone: string,
  status: 'success' | 'failed' | 'retrying',
  metadata?: any
): Promise<void> {
  try {
    const statusKey = `processing_status:${instanceName}:${userPhone}`;
    await safeRedisCommand(
      async (client) => {
        await client.setex(statusKey, 3600, JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
          metadata: metadata || {}
        }));
        return true;
      },
      false
    );
    
    logger.debug('Processing status saved', { 
      instanceName, 
      userPhone, 
      status,
      statusKey 
    });
  } catch (error) {
    logger.error('Failed to save processing status', { 
      error, 
      instanceName, 
      userPhone, 
      status 
    });
  }
}

/**
 * Schedule delayed processing via HTTP call with retry mechanism
 */
export async function scheduleDelayedProcessingViaHTTP(
  instanceName: string,
  userPhone: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  retryCount: number = 0  // New optional parameter with default value
): Promise<boolean> {
  try {
    const maxRetries = 3;
    const retryDelay = retryCount > 0 ? 1000 * Math.pow(2, retryCount - 1) : 0; // Exponential backoff: 0, 1s, 2s, 4s
    
    logger.info('Scheduling delayed processing via HTTP', {
      instanceName,
      userPhone,
      delayMs: BUFFER_DELAY_MS,
      retryCount,
      retryDelay,
      attempt: retryCount + 1,
      maxRetries: maxRetries + 1
    });

    // Use setTimeout to delay the HTTP call
    const totalDelay = retryCount === 0 ? BUFFER_DELAY_MS : retryDelay;
    
    setTimeout(async () => {
      try {
        logger.info('Executing delayed processing HTTP call', {
          instanceName,
          userPhone,
          attempt: retryCount + 1,
          maxRetries: maxRetries + 1
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
          logger.info('✅ Delayed processing completed successfully', {
            instanceName,
            userPhone,
            result,
            attempt: retryCount + 1
          });
          
          // Save success status
          await saveProcessingStatus(instanceName, userPhone, 'success', {
            attempt: retryCount + 1,
            responseData: result
          });
        } else {
          const errorText = await response.text();
          logger.error('❌ Delayed processing failed', {
            instanceName,
            userPhone,
            status: response.status,
            error: errorText,
            attempt: retryCount + 1
          });
          
          // Handle retry logic
          if (retryCount < maxRetries) {
            logger.info('🔄 Scheduling retry for delayed processing', {
              instanceName,
              userPhone,
              nextAttempt: retryCount + 2,
              maxRetries: maxRetries + 1,
              nextDelayMs: 1000 * Math.pow(2, retryCount)
            });
            
            // Save retrying status
            await saveProcessingStatus(instanceName, userPhone, 'retrying', {
              attempt: retryCount + 1,
              nextAttempt: retryCount + 2,
              error: errorText
            });
            
            // Schedule retry with exponential backoff
            scheduleDelayedProcessingViaHTTP(
              instanceName,
              userPhone,
              supabaseUrl,
              supabaseServiceKey,
              retryCount + 1
            );
          } else {
            logger.error('❌ Max retries reached, giving up', {
              instanceName,
              userPhone,
              totalAttempts: retryCount + 1
            });
            
            // Save failed status
            await saveProcessingStatus(instanceName, userPhone, 'failed', {
              totalAttempts: retryCount + 1,
              finalError: errorText
            });
          }
        }
      } catch (error) {
        logger.error('Exception in delayed processing HTTP call', {
          instanceName,
          userPhone,
          error: error instanceof Error ? error.message : error,
          attempt: retryCount + 1
        });
        
        // Retry on exception
        if (retryCount < maxRetries) {
          logger.info('🔄 Scheduling retry after exception', {
            instanceName,
            userPhone,
            nextAttempt: retryCount + 2,
            nextDelayMs: 1000 * Math.pow(2, retryCount)
          });
          
          // Save retrying status
          await saveProcessingStatus(instanceName, userPhone, 'retrying', {
            attempt: retryCount + 1,
            nextAttempt: retryCount + 2,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Schedule retry
          scheduleDelayedProcessingViaHTTP(
            instanceName,
            userPhone,
            supabaseUrl,
            supabaseServiceKey,
            retryCount + 1
          );
        } else {
          logger.error('❌ Max retries reached after exception', {
            instanceName,
            userPhone,
            totalAttempts: retryCount + 1
          });
          
          // Save failed status
          await saveProcessingStatus(instanceName, userPhone, 'failed', {
            totalAttempts: retryCount + 1,
            finalError: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }, totalDelay);

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

/**
 * Acquire a distributed lock using Redis
 * Uses SET with NX (only set if not exists) and PX (expire time in milliseconds)
 */
async function acquireLock(lockKey: string, timeoutMs: number = 2000): Promise<boolean> {
  try {
    const result = await safeRedisCommand(
      async (client) => {
        // Try to set the lock with NX (only if not exists) and PX (expire in milliseconds)
        // Using Upstash Redis syntax
        const lockId = `${Date.now()}_${Math.random()}`;
        const response = await client.set(lockKey, lockId, {
          nx: true,  // Only set if not exists
          px: timeoutMs  // Expire after timeout milliseconds
        });
        return response === 'OK';
      },
      false
    );
    
    if (result) {
      logger.debug('Lock acquired successfully', { lockKey, timeoutMs });
    } else {
      logger.debug('Failed to acquire lock (already exists)', { lockKey });
    }
    
    return result;
  } catch (error) {
    logger.error('Error acquiring lock:', { lockKey, error });
    return false;
  }
}

/**
 * Release a distributed lock
 */
async function releaseLock(lockKey: string): Promise<boolean> {
  try {
    const result = await safeRedisCommand(
      async (client) => {
        const deleted = await client.del(lockKey);
        return deleted === 1;
      },
      false
    );
    
    if (result) {
      logger.debug('Lock released successfully', { lockKey });
    }
    
    return result;
  } catch (error) {
    logger.error('Error releasing lock:', { lockKey, error });
    return false;
  }
}