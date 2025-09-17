import { getRedisClient, safeRedisCommand } from './upstash-client.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Queue configuration constants
const QUEUE_TTL = 3600;           // 1 hour
const LOCK_TTL = 60;              // 1 minute  
const MAX_RETRY_COUNT = 3;        // Maximum retry attempts

// Message queue interface
export interface QueueMessage {
  id: string;                     // unique ID (uuid)
  instanceName: string;
  userPhone: string;
  message: string;
  messageData: any;               // complete webhook data
  timestamp: string;              // original message timestamp
  addedAt: string;               // queue entry timestamp
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  processingStartedAt?: string;
  completedAt?: string;
}

// Queue operation result interface
export interface QueueResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

// Generate unique message ID
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Generate queue key for a user
function getQueueKey(instanceName: string, userPhone: string): string {
  return `msg_queue:${instanceName}:${userPhone}`;
}

// Generate lock key for processing
function getLockKey(instanceName: string, userPhone: string): string {
  return `processing_lock:${instanceName}:${userPhone}`;
}

/**
 * Add message to Redis queue atomically
 */
export async function addToQueue(
  instanceName: string, 
  userPhone: string, 
  messageData: any
): Promise<QueueResult> {
  try {
    const messageId = generateMessageId();
    const queueKey = getQueueKey(instanceName, userPhone);
    const now = new Date().toISOString();
    
    // Extract message text from messageData
    const messageText = messageData.message?.conversation || 
                       messageData.message?.extendedTextMessage?.text ||
                       '[Media Message]';

    // Create queue message object
    const queueMessage: QueueMessage = {
      id: messageId,
      instanceName,
      userPhone,
      message: messageText,
      messageData,
      timestamp: messageData.messageTimestamp || now,
      addedAt: now,
      status: 'pending',
      retryCount: 0
    };

    logger.info('🔄 Adding message to Redis queue', {
      messageId,
      instanceName,
      userPhone,
      messagePreview: messageText.substring(0, 50) + '...'
    });

    // Atomic operation: add to queue, set TTL, and update active queues
    const result = await safeRedisCommand(
      async (client) => {
        return await client.multi()
          .lpush(queueKey, JSON.stringify(queueMessage))
          .expire(queueKey, QUEUE_TTL)
          .sadd('active_queues', queueKey)
          .exec();
      },
      null
    );

    if (!result) {
      const errorMsg = 'Redis operation failed - atomic add failed';
      logger.error('❌ Queue add failed', {
        messageId,
        instanceName,
        userPhone,
        error: errorMsg
      });
      return { success: false, error: errorMsg };
    }

    logger.info('✅ Message added to queue successfully', {
      messageId,
      instanceName,
      userPhone,
      queueKey
    });

    return { success: true, messageId };
  } catch (error) {
    const errorMsg = `Failed to add message to queue: ${error.message || error}`;
    logger.error('💥 Exception in addToQueue', {
      error: errorMsg,
      instanceName,
      userPhone,
      stack: error.stack
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get pending messages from queue
 */
export async function getPendingMessages(
  instanceName: string, 
  userPhone: string
): Promise<QueueMessage[]> {
  try {
    const queueKey = getQueueKey(instanceName, userPhone);
    
    logger.debug('📥 Getting pending messages from queue', {
      instanceName,
      userPhone,
      queueKey
    });

    const messages = await safeRedisCommand(
      async (client) => {
        const rawMessages = await client.lrange(queueKey, 0, -1);
        return rawMessages.map(msg => {
          try {
            // تحسين error handling - التحقق من نوع البيانات أولاً
            if (typeof msg === 'object' && msg !== null) {
              // إذا كان object بالفعل، فلا نحتاج JSON.parse
              logger.debug('📦 Message already parsed as object', {
                messageId: msg.id || 'unknown',
                messageType: typeof msg
              });
              return msg;
            }
            
            if (typeof msg === 'string') {
              // إذا كان string، فنحتاج JSON.parse
              const parsedMsg = JSON.parse(msg);
              logger.debug('📄 Successfully parsed string message', {
                messageId: parsedMsg.id || 'unknown',
                originalLength: msg.length
              });
              return parsedMsg;
            }
            
            // نوع غير متوقع
            throw new Error(`Unexpected message type: ${typeof msg}, value: ${msg}`);
            
          } catch (parseError) {
            logger.warn('⚠️ Failed to parse queue message - Enhanced diagnostics', {
              error: parseError.message || parseError,
              messageType: typeof msg,
              messageContent: msg,
              messagePreview: String(msg).substring(0, 150) + '...',
              isObjectString: typeof msg === 'string' && msg.startsWith('{'),
              instanceName,
              userPhone,
              queueKey
            });
            return null;
          }
        }).filter(msg => msg !== null);
      },
      []
    );

    // Filter only pending messages and sort by timestamp
    const pendingMessages = messages
      .filter(msg => msg.status === 'pending')
      .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());

    logger.debug('📤 Retrieved pending messages', {
      instanceName,
      userPhone,
      totalMessages: messages.length,
      pendingMessages: pendingMessages.length
    });

    return pendingMessages;
  } catch (error) {
    logger.error('💥 Exception in getPendingMessages', {
      error: error.message || error,
      instanceName,
      userPhone
    });
    return [];
  }
}

/**
 * Mark messages as processing
 */
export async function markMessagesAsProcessing(messages: QueueMessage[]): Promise<boolean> {
  if (messages.length === 0) return true;

  try {
    const processingTime = new Date().toISOString();
    
    // Update message status to processing
    const updatedMessages = messages.map(msg => ({
      ...msg,
      status: 'processing' as const,
      processingStartedAt: processingTime
    }));

    // Update each queue with processed messages
    const queueGroups = updatedMessages.reduce((groups, msg) => {
      const queueKey = getQueueKey(msg.instanceName, msg.userPhone);
      if (!groups[queueKey]) groups[queueKey] = [];
      groups[queueKey].push(msg);
      return groups;
    }, {} as Record<string, QueueMessage[]>);

    for (const [queueKey, queueMessages] of Object.entries(queueGroups)) {
      await safeRedisCommand(
        async (client) => {
          // Replace the entire queue with updated messages
          const pipeline = client.multi();
          pipeline.del(queueKey);
          for (const msg of queueMessages) {
            pipeline.lpush(queueKey, JSON.stringify(msg));
          }
          pipeline.expire(queueKey, QUEUE_TTL);
          return await pipeline.exec();
        },
        null
      );
    }

    logger.info('✅ Messages marked as processing', {
      messageCount: messages.length,
      messageIds: messages.map(m => m.id)
    });

    return true;
  } catch (error) {
    logger.error('💥 Exception in markMessagesAsProcessing', {
      error: error.message || error,
      messageCount: messages.length
    });
    return false;
  }
}

/**
 * Mark messages as completed and remove from queue
 */
export async function markMessagesAsCompleted(messages: QueueMessage[]): Promise<boolean> {
  if (messages.length === 0) return true;

  try {
    const completionTime = new Date().toISOString();
    
    // Group messages by queue
    const queueGroups = messages.reduce((groups, msg) => {
      const queueKey = getQueueKey(msg.instanceName, msg.userPhone);
      if (!groups[queueKey]) groups[queueKey] = [];
      groups[queueKey].push(msg.id);
      return groups;
    }, {} as Record<string, string[]>);

    // Remove completed messages from each queue
    for (const [queueKey, messageIds] of Object.entries(queueGroups)) {
      await safeRedisCommand(
        async (client) => {
          // Get all messages from queue
          const allMessages = await client.lrange(queueKey, 0, -1);
          const parsedMessages = allMessages.map(msg => {
            try {
              return JSON.parse(msg);
            } catch {
              return null;
            }
          }).filter(msg => msg !== null);

          // Filter out completed messages
          const remainingMessages = parsedMessages.filter(msg => !messageIds.includes(msg.id));

          // Replace queue with remaining messages
          const pipeline = client.multi();
          pipeline.del(queueKey);
          
          if (remainingMessages.length > 0) {
            for (const msg of remainingMessages) {
              pipeline.lpush(queueKey, JSON.stringify(msg));
            }
            pipeline.expire(queueKey, QUEUE_TTL);
          } else {
            // Remove from active queues if empty
            pipeline.srem('active_queues', queueKey);
          }
          
          return await pipeline.exec();
        },
        null
      );
    }

    logger.info('✅ Messages marked as completed and removed', {
      messageCount: messages.length,
      messageIds: messages.map(m => m.id)
    });

    return true;
  } catch (error) {
    logger.error('💥 Exception in markMessagesAsCompleted', {
      error: error.message || error,
      messageCount: messages.length
    });
    return false;
  }
}

/**
 * Get list of active queue keys
 */
export async function getActiveQueues(): Promise<string[]> {
  try {
    const activeQueues = await safeRedisCommand(
      async (client) => {
        return await client.smembers('active_queues');
      },
      []
    );

    logger.debug('📋 Retrieved active queues', {
      queueCount: activeQueues.length,
      queues: activeQueues
    });

    return activeQueues;
  } catch (error) {
    logger.error('💥 Exception in getActiveQueues', {
      error: error.message || error
    });
    return [];
  }
}

/**
 * Acquire processing lock for a user queue
 */
export async function acquireProcessingLock(
  instanceName: string, 
  userPhone: string,
  processorId: string
): Promise<boolean> {
  try {
    const lockKey = getLockKey(instanceName, userPhone);
    const lockData = {
      processorId,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + LOCK_TTL * 1000).toISOString()
    };

    const acquired = await safeRedisCommand(
      async (client) => {
        // Use SET with NX (only if not exists) and EX (expiration)
        const result = await client.set(lockKey, JSON.stringify(lockData), {
          nx: true,
          ex: LOCK_TTL
        });
        return result === 'OK';
      },
      false
    );

    if (acquired) {
      logger.debug('🔒 Processing lock acquired', {
        instanceName,
        userPhone,
        processorId,
        lockKey
      });
    } else {
      logger.debug('🚫 Processing lock already exists', {
        instanceName,
        userPhone,
        processorId
      });
    }

    return acquired;
  } catch (error) {
    logger.error('💥 Exception in acquireProcessingLock', {
      error: error.message || error,
      instanceName,
      userPhone,
      processorId
    });
    return false;
  }
}

/**
 * Release processing lock
 */
export async function releaseProcessingLock(
  instanceName: string, 
  userPhone: string,
  processorId: string
): Promise<boolean> {
  try {
    const lockKey = getLockKey(instanceName, userPhone);

    const released = await safeRedisCommand(
      async (client) => {
        // Get current lock to verify ownership
        const currentLock = await client.get(lockKey);
        if (!currentLock) {
          return true; // Already released
        }

        try {
          const lockData = JSON.parse(currentLock);
          if (lockData.processorId !== processorId) {
            logger.warn('Cannot release lock - processor ID mismatch', {
              expected: processorId,
              actual: lockData.processorId
            });
            return false;
          }
        } catch (parseError) {
          logger.warn('Failed to parse lock data, releasing anyway');
        }

        // Delete the lock
        const result = await client.del(lockKey);
        return result > 0;
      },
      false
    );

    if (released) {
      logger.debug('🔓 Processing lock released', {
        instanceName,
        userPhone,
        processorId,
        lockKey
      });
    }

    return released;
  } catch (error) {
    logger.error('💥 Exception in releaseProcessingLock', {
      error: error.message || error,
      instanceName,
      userPhone,
      processorId
    });
    return false;
  }
}

/**
 * Test Redis queue operations (for debugging)
 */
export async function testQueueOperations(): Promise<boolean> {
  try {
    logger.info('🧪 Testing Redis queue operations');
    
    const testInstanceName = 'test_instance';
    const testUserPhone = '1234567890';
    const testMessageData = {
      message: { conversation: 'Test message' },
      messageTimestamp: new Date().toISOString()
    };

    // Test add to queue
    const addResult = await addToQueue(testInstanceName, testUserPhone, testMessageData);
    if (!addResult.success) {
      logger.error('❌ Test failed: addToQueue');
      return false;
    }

    // Test get pending messages
    const messages = await getPendingMessages(testInstanceName, testUserPhone);
    if (messages.length === 0) {
      logger.error('❌ Test failed: getPendingMessages');
      return false;
    }

    // Test mark as completed
    const completeResult = await markMessagesAsCompleted(messages);
    if (!completeResult) {
      logger.error('❌ Test failed: markMessagesAsCompleted');
      return false;
    }

    logger.info('✅ All Redis queue operations test passed');
    return true;
  } catch (error) {
    logger.error('💥 Redis queue operations test failed', {
      error: error.message || error
    });
    return false;
  }
}