import { getRedisClient, safeRedisCommand } from './upstash-client.ts';
import { 
  getActiveQueues, 
  getPendingMessages, 
  markMessagesAsCompleted,
  QueueMessage 
} from './redis-queue.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Monitoring configuration
const LOCK_EXPIRY_GRACE_PERIOD = 120000;    // 2 minutes grace period for expired locks
const ORPHANED_MESSAGE_TIMEOUT = 1800000;   // 30 minutes for orphaned messages
const MAX_QUEUE_AGE = 7200000;               // 2 hours max queue age

// Health report interface
export interface HealthReport {
  success: boolean;
  timestamp: string;
  redisConnected: boolean;
  activeQueues: number;
  totalPendingMessages: number;
  orphanedMessages: number;
  expiredLocks: number;
  warnings: string[];
  errors: string[];
}

// Queue statistics interface
export interface QueueStats {
  totalQueues: number;
  totalMessages: number;
  averageMessagesPerQueue: number;
  oldestMessageAge: number;
  newestMessageAge: number;
  queuesWithMessages: number;
}

/**
 * Test Redis connection health
 */
async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    // Test with a simple ping
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('❌ Redis connection test failed:', error);
    return false;
  }
}

/**
 * Detect and clean up expired processing locks
 */
export async function cleanupExpiredLocks(): Promise<number> {
  try {
    logger.debug('🧹 Starting expired lock cleanup');

    let cleanedCount = 0;
    const activeQueues = await getActiveQueues();

    for (const queueKey of activeQueues) {
      const keyParts = queueKey.split(':');
      if (keyParts.length !== 3 || keyParts[0] !== 'msg_queue') {
        continue;
      }

      const instanceName = keyParts[1];
      const userPhone = keyParts[2];
      const lockKey = `processing_lock:${instanceName}:${userPhone}`;

      // Check if lock exists and is expired
      const lockData = await safeRedisCommand(
        async (client) => {
          const data = await client.get(lockKey);
          return data ? JSON.parse(data) : null;
        },
        null
      );

      if (lockData) {
        const expiresAt = new Date(lockData.expiresAt).getTime();
        const now = Date.now();
        
        // If lock is expired beyond grace period, remove it
        if (now > expiresAt + LOCK_EXPIRY_GRACE_PERIOD) {
          const removed = await safeRedisCommand(
            async (client) => {
              return await client.del(lockKey);
            },
            0
          );

          if (removed > 0) {
            cleanedCount++;
            logger.info('🗑️ Removed expired lock', {
              lockKey,
              instanceName,
              userPhone,
              expiredSince: new Date(expiresAt).toISOString(),
              gracePeriodMs: LOCK_EXPIRY_GRACE_PERIOD
            });
          }
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info('✅ Expired lock cleanup completed', {
        cleanedLocks: cleanedCount,
        totalQueuesChecked: activeQueues.length
      });
    } else {
      logger.debug('✅ No expired locks found');
    }

    return cleanedCount;
  } catch (error) {
    logger.error('💥 Exception in cleanupExpiredLocks', {
      error: error.message || error
    });
    return 0;
  }
}

/**
 * Detect orphaned messages (messages stuck in processing state)
 */
export async function detectOrphanedMessages(): Promise<QueueMessage[]> {
  try {
    logger.debug('🔍 Detecting orphaned messages');

    const orphanedMessages: QueueMessage[] = [];
    const activeQueues = await getActiveQueues();

    for (const queueKey of activeQueues) {
      const keyParts = queueKey.split(':');
      if (keyParts.length !== 3 || keyParts[0] !== 'msg_queue') {
        continue;
      }

      const instanceName = keyParts[1];
      const userPhone = keyParts[2];

      // Get all messages from queue
      const allMessages = await safeRedisCommand(
        async (client) => {
          const rawMessages = await client.lrange(queueKey, 0, -1);
          return rawMessages.map(msg => {
            try {
              return JSON.parse(msg);
            } catch {
              return null;
            }
          }).filter(msg => msg !== null);
        },
        []
      );

      // Check for messages in processing state that are too old
      const now = Date.now();
      for (const message of allMessages) {
        if (message.status === 'processing' && message.processingStartedAt) {
          const processingStartTime = new Date(message.processingStartedAt).getTime();
          const processingDuration = now - processingStartTime;

          if (processingDuration > ORPHANED_MESSAGE_TIMEOUT) {
            orphanedMessages.push(message);
            logger.warn('🚨 Orphaned message detected', {
              messageId: message.id,
              instanceName,
              userPhone,
              processingStarted: message.processingStartedAt,
              processingDuration,
              messagePreview: message.message.substring(0, 50)
            });
          }
        }
      }
    }

    if (orphanedMessages.length > 0) {
      logger.warn('⚠️ Found orphaned messages', {
        orphanedCount: orphanedMessages.length,
        messageIds: orphanedMessages.map(m => m.id)
      });
    } else {
      logger.debug('✅ No orphaned messages found');
    }

    return orphanedMessages;
  } catch (error) {
    logger.error('💥 Exception in detectOrphanedMessages', {
      error: error.message || error
    });
    return [];
  }
}

/**
 * Recover orphaned messages by resetting their status to pending
 */
export async function recoverOrphanedMessages(): Promise<number> {
  try {
    const orphanedMessages = await detectOrphanedMessages();
    
    if (orphanedMessages.length === 0) {
      return 0;
    }

    logger.info('🔄 Starting orphaned message recovery', {
      orphanedCount: orphanedMessages.length
    });

    let recoveredCount = 0;

    // Group orphaned messages by queue
    const messagesByQueue = orphanedMessages.reduce((groups, msg) => {
      const queueKey = `msg_queue:${msg.instanceName}:${msg.userPhone}`;
      if (!groups[queueKey]) groups[queueKey] = [];
      groups[queueKey].push(msg);
      return groups;
    }, {} as Record<string, QueueMessage[]>);

    // Reset status for each queue
    for (const [queueKey, messages] of Object.entries(messagesByQueue)) {
      const success = await safeRedisCommand(
        async (client) => {
          // Get all messages from queue
          const allRawMessages = await client.lrange(queueKey, 0, -1);
          const allMessages = allRawMessages.map(msg => {
            try {
              return JSON.parse(msg);
            } catch {
              return null;
            }
          }).filter(msg => msg !== null);

          // Update orphaned messages to pending status
          const updatedMessages = allMessages.map(msg => {
            const isOrphaned = messages.some(orphaned => orphaned.id === msg.id);
            if (isOrphaned) {
              return {
                ...msg,
                status: 'pending',
                processingStartedAt: undefined,
                retryCount: (msg.retryCount || 0) + 1
              };
            }
            return msg;
          });

          // Replace queue with updated messages
          const pipeline = client.multi();
          pipeline.del(queueKey);
          for (const msg of updatedMessages) {
            pipeline.lpush(queueKey, JSON.stringify(msg));
          }
          pipeline.expire(queueKey, 3600); // 1 hour TTL
          
          await pipeline.exec();
          return true;
        },
        false
      );

      if (success) {
        recoveredCount += messages.length;
        logger.info('✅ Recovered orphaned messages in queue', {
          queueKey,
          recoveredCount: messages.length,
          messageIds: messages.map(m => m.id)
        });
      }
    }

    logger.info('🎯 Orphaned message recovery completed', {
      totalOrphaned: orphanedMessages.length,
      recovered: recoveredCount
    });

    return recoveredCount;
  } catch (error) {
    logger.error('💥 Exception in recoverOrphanedMessages', {
      error: error.message || error
    });
    return 0;
  }
}

/**
 * Get comprehensive queue depth statistics
 */
export async function getQueueDepthStats(): Promise<QueueStats> {
  try {
    const activeQueues = await getActiveQueues();
    const stats: QueueStats = {
      totalQueues: activeQueues.length,
      totalMessages: 0,
      averageMessagesPerQueue: 0,
      oldestMessageAge: 0,
      newestMessageAge: 0,
      queuesWithMessages: 0
    };

    if (activeQueues.length === 0) {
      return stats;
    }

    const allMessageAges: number[] = [];
    let queuesWithMessages = 0;

    for (const queueKey of activeQueues) {
      const keyParts = queueKey.split(':');
      if (keyParts.length !== 3 || keyParts[0] !== 'msg_queue') {
        continue;
      }

      const instanceName = keyParts[1];
      const userPhone = keyParts[2];
      const messages = await getPendingMessages(instanceName, userPhone);

      if (messages.length > 0) {
        queuesWithMessages++;
        stats.totalMessages += messages.length;

        // Calculate message ages
        const now = Date.now();
        for (const message of messages) {
          const messageAge = now - new Date(message.addedAt).getTime();
          allMessageAges.push(messageAge);
        }
      }
    }

    stats.queuesWithMessages = queuesWithMessages;
    stats.averageMessagesPerQueue = queuesWithMessages > 0 ? stats.totalMessages / queuesWithMessages : 0;

    if (allMessageAges.length > 0) {
      stats.oldestMessageAge = Math.max(...allMessageAges);
      stats.newestMessageAge = Math.min(...allMessageAges);
    }

    logger.debug('📊 Queue statistics calculated', stats);

    return stats;
  } catch (error) {
    logger.error('💥 Exception in getQueueDepthStats', {
      error: error.message || error
    });
    
    return {
      totalQueues: 0,
      totalMessages: 0,
      averageMessagesPerQueue: 0,
      oldestMessageAge: 0,
      newestMessageAge: 0,
      queuesWithMessages: 0
    };
  }
}

/**
 * Perform comprehensive health monitoring
 */
export async function monitorRedisHealth(): Promise<HealthReport> {
  const startTime = Date.now();
  const report: HealthReport = {
    success: true,
    timestamp: new Date().toISOString(),
    redisConnected: false,
    activeQueues: 0,
    totalPendingMessages: 0,
    orphanedMessages: 0,
    expiredLocks: 0,
    warnings: [],
    errors: []
  };

  try {
    logger.debug('🏥 Starting Redis health monitoring');

    // Test Redis connection
    report.redisConnected = await testRedisConnection();
    if (!report.redisConnected) {
      report.success = false;
      report.errors.push('Redis connection failed');
      return report;
    }

    // Get queue statistics
    const stats = await getQueueDepthStats();
    report.activeQueues = stats.totalQueues;
    report.totalPendingMessages = stats.totalMessages;

    // Check for orphaned messages
    const orphanedMessages = await detectOrphanedMessages();
    report.orphanedMessages = orphanedMessages.length;

    // Clean up expired locks
    report.expiredLocks = await cleanupExpiredLocks();

    // Generate warnings based on thresholds
    if (stats.totalMessages > 100) {
      report.warnings.push(`High message backlog: ${stats.totalMessages} pending messages`);
    }

    if (stats.oldestMessageAge > 300000) { // 5 minutes
      report.warnings.push(`Old messages detected: oldest message is ${Math.round(stats.oldestMessageAge / 60000)} minutes old`);
    }

    if (orphanedMessages.length > 0) {
      report.warnings.push(`Orphaned messages detected: ${orphanedMessages.length} messages stuck in processing`);
    }

    if (report.expiredLocks > 0) {
      report.warnings.push(`Expired locks cleaned up: ${report.expiredLocks} locks removed`);
    }

    // Auto-recover orphaned messages if found
    if (orphanedMessages.length > 0) {
      const recoveredCount = await recoverOrphanedMessages();
      if (recoveredCount > 0) {
        report.warnings.push(`Auto-recovered ${recoveredCount} orphaned messages`);
      }
    }

    const monitoringTime = Date.now() - startTime;
    logger.info('✅ Redis health monitoring completed', {
      success: report.success,
      redisConnected: report.redisConnected,
      activeQueues: report.activeQueues,
      totalPendingMessages: report.totalPendingMessages,
      orphanedMessages: report.orphanedMessages,
      expiredLocks: report.expiredLocks,
      warnings: report.warnings.length,
      errors: report.errors.length,
      monitoringTime
    });

    return report;

  } catch (error) {
    logger.error('💥 Fatal error in Redis health monitoring', {
      error: error.message || error,
      stack: error.stack
    });

    report.success = false;
    report.errors.push(`Monitoring error: ${error.message || error}`);
    
    return report;
  }
}

/**
 * Quick cleanup for immediate dead key removal (lighter than emergency cleanup)
 */
export async function quickCleanupDeadKeys(): Promise<{ success: boolean; cleanedItems: number; errors: string[] }> {
  const result = {
    success: true,
    cleanedItems: 0,
    errors: []
  };

  try {
    logger.info('🚀 Starting quick cleanup for dead keys');

    // Import the cleanup function from redis-queue
    const { cleanupDeadQueueKeys } = await import('./redis-queue.ts');
    
    // Clean up dead queue keys
    const deadKeysRemoved = await cleanupDeadQueueKeys();
    result.cleanedItems += deadKeysRemoved;

    // Clean up expired locks
    const expiredLocksRemoved = await cleanupExpiredLocks();
    result.cleanedItems += expiredLocksRemoved;

    logger.info('✅ Quick cleanup completed', {
      deadKeysRemoved,
      expiredLocksRemoved,
      totalCleaned: result.cleanedItems
    });

    return result;
  } catch (error) {
    logger.error('💥 Exception in quick cleanup', {
      error: error.message || error
    });

    result.success = false;
    result.errors.push(`Quick cleanup error: ${error.message || error}`);
    
    return result;
  }
}

/**
 * Emergency cleanup - remove all expired queues and data
 */
export async function emergencyCleanup(): Promise<{ success: boolean; cleanedItems: number; errors: string[] }> {
  const result = {
    success: true,
    cleanedItems: 0,
    errors: []
  };

  try {
    logger.warn('🚨 Starting emergency cleanup');

    const activeQueues = await getActiveQueues();
    const now = Date.now();

    for (const queueKey of activeQueues) {
      try {
        // Get queue TTL
        const ttl = await safeRedisCommand(
          async (client) => {
            return await client.ttl(queueKey);
          },
          -1
        );

        // If queue has no TTL or is very old, remove it
        if (ttl === -1 || ttl > 3600) { // More than 1 hour
          const removed = await safeRedisCommand(
            async (client) => {
              const pipeline = client.multi();
              pipeline.del(queueKey);
              pipeline.srem('active_queues', queueKey);
              
              // Also remove associated lock
              const keyParts = queueKey.split(':');
              if (keyParts.length === 3) {
                const lockKey = `processing_lock:${keyParts[1]}:${keyParts[2]}`;
                pipeline.del(lockKey);
              }
              
              const results = await pipeline.exec();
              return results && results.length > 0;
            },
            false
          );

          if (removed) {
            result.cleanedItems++;
            logger.info('🗑️ Emergency cleanup removed queue', { queueKey });
          }
        }
      } catch (queueError) {
        result.errors.push(`Failed to cleanup queue ${queueKey}: ${queueError.message}`);
      }
    }

    logger.warn('🚨 Emergency cleanup completed', {
      cleanedItems: result.cleanedItems,
      errors: result.errors.length
    });

    return result;
  } catch (error) {
    logger.error('💥 Exception in emergency cleanup', {
      error: error.message || error
    });

    result.success = false;
    result.errors.push(`Emergency cleanup error: ${error.message || error}`);
    
    return result;
  }
}