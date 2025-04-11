
/**
 * Message Buffer Module
 * 
 * This module provides a conversation-based message buffering system with debounce logic
 * to combine closely timed messages from the same sender before processing.
 */

import logDebug from "./webhook-logger.ts";

// Define types for our buffer system
export interface BufferedMessage {
  messageData: any;           // The original message data
  timestamp: number;         // When the message was added to buffer
  instanceName: string;      // The WhatsApp instance name
  fromNumber: string;        // The sender's phone number
  messageText: string | null; // The message text content
  messageId: string;         // Unique message ID
  imageUrl?: string | null;   // Optional image URL if message contains image
}

// Define buffer states for improved lifecycle management
export type BufferState = 'active' | 'processing' | 'cooldown' | 'expired';

export interface ConversationBuffer {
  messages: BufferedMessage[];  // Array of buffered messages
  timeoutId: number | null;     // The debounce timeout ID
  lastUpdated: number;          // Timestamp of last buffer update
  createdAt: number;            // When the buffer was initially created
  processingAttempts: number;   // Number of times processing was attempted
  lastProcessingTimestamp: number | null; // When the buffer was last processed
  state: BufferState;          // Current state of the buffer
  cooldownTimeoutId: number | null; // Timeout ID for cooldown period
  lastProcessedAt: number | null; // When messages were last processed
}

// Configuration options with safe defaults
export interface BufferConfig {
  debounceTimeMs: number;     // How long to wait before processing (default: 5000ms)
  maxBufferSize: number;      // Maximum messages per conversation (safety limit)
  maxBufferAgeMs: number;     // Maximum age of any buffer before forced processing
  cleanupIntervalMs: number;  // How often to check for stale buffers
  maxTimeBetweenMessages: number; // Maximum time between messages to consider them part of the same context
  maxBufferLifetimeMs: number; // Maximum total lifetime of any buffer before forced processing
  stuckBufferThresholdMs: number; // Time threshold to consider a buffer stuck in processing
  emergencyFlushThresholdMs: number; // Time threshold for emergency buffer flush for inactive conversations
  maxProcessingAttempts: number; // Maximum number of processing attempts before reporting error
  cooldownPeriodMs: number;   // How long to keep buffer in cooldown state after processing
  bufferRetentionMs: number;  // Maximum time to keep an empty buffer before removing it
}

// Default configuration
const DEFAULT_CONFIG: BufferConfig = {
  debounceTimeMs: 5000,      // 5 seconds debounce time
  maxBufferSize: 10,         // Maximum 10 messages per conversation buffer
  maxBufferAgeMs: 30000,     // Force process after 30 seconds (failsafe)
  cleanupIntervalMs: 60000,  // Check for stale buffers every 60 seconds
  maxTimeBetweenMessages: 60000, // Messages 60 seconds apart or less are considered related
  maxBufferLifetimeMs: 300000, // Force process any buffer older than 5 minutes (failsafe)
  stuckBufferThresholdMs: 120000, // Consider a buffer stuck if processing for more than 2 minutes
  emergencyFlushThresholdMs: 1800000, // Emergency flush for conversations inactive for 30 minutes
  maxProcessingAttempts: 3,  // Retry processing up to 3 times before reporting error
  cooldownPeriodMs: 60000,   // Keep buffer in cooldown state for 1 minute after processing
  bufferRetentionMs: 120000, // Keep empty buffers for 2 minutes before removing them
};

// Monitoring stats interface
export interface BufferStats {
  totalBuffers: number;
  totalMessages: number;
  oldestBufferAge: number;
  averageMessagesPerBuffer: number;
  maxBufferSize: number;
  stuckBuffers: number;
  processingSuccessRate: number;
  averageProcessingTimeMs: number | null;
  emergencyFlushes: number;
  memoryUsageBytes: number;
  buffersByState: Record<BufferState, number>; // Count of buffers in each state
}

/**
 * Message Buffer Manager for WhatsApp conversations
 * Implements debounce pattern to group closely timed messages
 */
export class MessageBufferManager {
  private buffers: Map<string, ConversationBuffer>;
  private config: BufferConfig;
  private cleanupInterval: number | null;
  private monitoringInterval: number | null;
  
  // Monitoring metrics
  private processedBuffersCount: number = 0;
  private failedProcessingCount: number = 0;
  private emergencyFlushCount: number = 0;
  private processingTimes: number[] = [];
  private lastMemoryUsage: number = 0;

  /**
   * Create a new MessageBufferManager
   * @param config Optional configuration to override defaults
   */
  constructor(config: Partial<BufferConfig> = {}) {
    this.buffers = new Map<string, ConversationBuffer>();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = null;
    this.monitoringInterval = null;
    
    // Start the cleanup interval
    this.startCleanupInterval();
    
    // Start the monitoring interval
    this.startMonitoringInterval();
    
    // Log buffer creation
    logDebug('MESSAGE_BUFFER_CREATED', 'Message buffer system initialized', {
      config: this.config
    });
    
    // Record initial memory usage
    this.updateMemoryUsage();
  }

  /**
   * Update the current memory usage metric
   */
  private updateMemoryUsage(): void {
    try {
      // Deno provides a simple API for memory usage
      if (typeof Deno !== 'undefined' && Deno.memoryUsage) {
        const memUsage = Deno.memoryUsage();
        this.lastMemoryUsage = memUsage.heapUsed || 0;
      } else {
        // Fallback for non-Deno environments
        this.lastMemoryUsage = 0;
      }
    } catch (error) {
      logDebug('MESSAGE_BUFFER_MEMORY_ERROR', 'Error getting memory usage', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.lastMemoryUsage = 0;
    }
  }

  /**
   * Generate a unique buffer key for a conversation
   * @param instanceName The WhatsApp instance name
   * @param fromNumber The sender's phone number
   * @returns A unique string key
   */
  private getBufferKey(instanceName: string, fromNumber: string): string {
    return `${instanceName}:${fromNumber}`;
  }

  /**
   * Start the interval to clean up stale buffers
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleBuffers();
    }, this.config.cleanupIntervalMs);
    
    logDebug('MESSAGE_BUFFER_CLEANUP_STARTED', 'Started message buffer cleanup interval', {
      intervalMs: this.config.cleanupIntervalMs
    });
  }

  /**
   * Start the interval to monitor buffer health
   */
  private startMonitoringInterval(): void {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      this.monitorBufferHealth();
    }, this.config.cleanupIntervalMs / 2); // Check twice as often as cleanup
    
    logDebug('MESSAGE_BUFFER_MONITORING_STARTED', 'Started message buffer health monitoring', {
      intervalMs: this.config.cleanupIntervalMs / 2
    });
  }

  /**
   * Monitor overall buffer system health and detect stuck buffers
   */
  private monitorBufferHealth(): void {
    const now = Date.now();
    const stats = this.getStats();
    let stuckBuffersDetected = 0;
    let emergencyFlushedBuffers = 0;
    
    // Update memory usage
    this.updateMemoryUsage();
    
    // Log periodic statistics
    logDebug('MESSAGE_BUFFER_STATS', 'Buffer system periodic statistics', stats);
    
    // Check for stuck buffers and very old inactive conversations
    for (const [key, buffer] of this.buffers.entries()) {
      // Check for stuck buffers (in processing state for too long)
      if (buffer.state === 'processing' && 
          buffer.lastProcessingTimestamp && 
          now - buffer.lastProcessingTimestamp > this.config.stuckBufferThresholdMs) {
        stuckBuffersDetected++;
        logDebug('MESSAGE_BUFFER_STUCK', 'Detected stuck buffer in processing state', {
          bufferKey: key,
          processingTime: now - buffer.lastProcessingTimestamp,
          messageCount: buffer.messages.length,
          attempts: buffer.processingAttempts
        });
        
        // If exceeded max attempts, force remove the buffer
        if (buffer.processingAttempts >= this.config.maxProcessingAttempts) {
          logDebug('MESSAGE_BUFFER_ABANDONED', 'Abandoning stuck buffer after max retries', {
            bufferKey: key,
            messageCount: buffer.messages.length,
            attempts: buffer.processingAttempts
          });
          
          this.failedProcessingCount++;
          this.buffers.delete(key);
        }
      }
      
      // Check for very old inactive conversations to emergency flush
      if (now - buffer.lastUpdated > this.config.emergencyFlushThresholdMs) {
        logDebug('MESSAGE_BUFFER_EMERGENCY_FLUSH', 'Emergency flush of long-inactive conversation', {
          bufferKey: key,
          inactiveTime: now - buffer.lastUpdated,
          messageCount: buffer.messages.length
        });
        
        // Increment emergency flush counter
        this.emergencyFlushCount++;
        emergencyFlushedBuffers++;
        
        // Mark buffer as expired
        buffer.state = 'expired';
        
        // Remove the buffer (in a real implementation, we would call flushBuffer here)
        this.buffers.delete(key);
      }
      
      // Check for empty buffers that have exceeded retention time
      if (buffer.state === 'cooldown' && 
          buffer.messages.length === 0 && 
          buffer.lastProcessedAt && 
          now - buffer.lastProcessedAt > this.config.bufferRetentionMs) {
        logDebug('MESSAGE_BUFFER_RETENTION_EXPIRED', 'Removing empty buffer that exceeded retention time', {
          bufferKey: key,
          retentionTime: now - buffer.lastProcessedAt,
          configRetention: this.config.bufferRetentionMs
        });
        
        // Clear any cooldown timeout
        if (buffer.cooldownTimeoutId !== null) {
          clearTimeout(buffer.cooldownTimeoutId);
        }
        
        // Remove the buffer
        this.buffers.delete(key);
      }
    }
    
    // Log summary of monitoring action if any was taken
    if (stuckBuffersDetected > 0 || emergencyFlushedBuffers > 0) {
      logDebug('MESSAGE_BUFFER_MONITORING_ACTION', 'Buffer monitoring actions taken', {
        stuckBuffersDetected,
        emergencyFlushedBuffers,
        totalBuffersRemaining: this.buffers.size,
        memoryUsage: this.lastMemoryUsage
      });
    }
  }

  /**
   * Clean up stale buffers to prevent memory leaks
   */
  private cleanupStaleBuffers(): void {
    const now = Date.now();
    let cleanedBuffers = 0;
    let processedStaleBuffers = 0;
    
    for (const [key, buffer] of this.buffers.entries()) {
      // If buffer is completely empty and in cooldown state for too long, remove it
      if (buffer.messages.length === 0 && 
          buffer.state === 'cooldown' && 
          buffer.lastProcessedAt && 
          now - buffer.lastProcessedAt > this.config.bufferRetentionMs) {
        // Clear any pending timeouts
        if (buffer.timeoutId !== null) {
          clearTimeout(buffer.timeoutId);
        }
        if (buffer.cooldownTimeoutId !== null) {
          clearTimeout(buffer.cooldownTimeoutId);
        }
        
        this.buffers.delete(key);
        cleanedBuffers++;
        continue;
      }
      
      // Check if buffer exceeds max lifetime (absolute failsafe)
      const bufferAge = now - buffer.createdAt;
      if (bufferAge > this.config.maxBufferLifetimeMs) {
        logDebug('MESSAGE_BUFFER_MAX_LIFETIME', 'Buffer exceeded maximum lifetime', {
          bufferKey: key,
          bufferAge,
          maxLifetime: this.config.maxBufferLifetimeMs,
          messageCount: buffer.messages.length,
          state: buffer.state
        });
        
        // In real implementation, we would call flushBuffer with the callback
        // For now, just remove it
        this.buffers.delete(key);
        processedStaleBuffers++;
        continue;
      }
      
      // If buffer has messages, is in active state, and is too old since last update, process it
      if (buffer.state === 'active' && 
          buffer.messages.length > 0 && 
          now - buffer.lastUpdated > this.config.maxBufferAgeMs) {
        logDebug('MESSAGE_BUFFER_STALE', 'Processing stale buffer', {
          bufferKey: key,
          messageCount: buffer.messages.length,
          bufferAge: now - buffer.lastUpdated
        });
        
        // Cancel any pending timeout
        if (buffer.timeoutId !== null) {
          clearTimeout(buffer.timeoutId);
          buffer.timeoutId = null;
        }
        
        // Mark buffer for processing (in a real call this would trigger flushBuffer)
        buffer.state = 'processing';
        processedStaleBuffers++;
      }
    }
    
    if (cleanedBuffers > 0 || processedStaleBuffers > 0) {
      logDebug('MESSAGE_BUFFER_CLEANUP', 'Cleaned up buffers', {
        emptyBuffersRemoved: cleanedBuffers,
        staleBuffersProcessed: processedStaleBuffers,
        remainingBuffers: this.buffers.size,
        memoryUsage: this.lastMemoryUsage
      });
    }
  }

  /**
   * Determines if a new message should be combined with existing buffered messages
   * based on time proximity and content type compatibility
   * 
   * @param buffer The existing conversation buffer
   * @param newMessage The new message to potentially add to buffer
   * @returns Boolean indicating if messages should be combined
   */
  private shouldCombineWithBuffer(buffer: ConversationBuffer, newMessage: BufferedMessage): boolean {
    // Empty buffer always accepts a new message
    if (buffer.messages.length === 0) {
      return true;
    }
    
    // If buffer is in cooldown, check timing to see if it can be reactivated
    if (buffer.state === 'cooldown') {
      const timeSinceProcessed = buffer.lastProcessedAt ? 
        Date.now() - buffer.lastProcessedAt : 
        Number.MAX_SAFE_INTEGER;
      
      // If we're still within the debounce window from the last processing, allow combination
      if (timeSinceProcessed < this.config.debounceTimeMs * 2) {
        logDebug('MESSAGE_BUFFER_REACTIVATE', 'Reactivating cooldown buffer for new message', {
          timeSinceProcessed,
          cooldownState: buffer.state,
          lastProcessedAt: buffer.lastProcessedAt
        });
        return true;
      }
    }
    
    const now = Date.now();
    
    // Check time elapsed since last message
    const timeSinceLastUpdate = now - buffer.lastUpdated;
    if (timeSinceLastUpdate > this.config.maxTimeBetweenMessages) {
      logDebug('MESSAGE_BUFFER_TOO_OLD', 'Buffer too old for combining, will flush first', {
        timeSinceLastUpdate,
        maxTimeBetweenMessages: this.config.maxTimeBetweenMessages
      });
      return false;
    }
    
    // Always combine if we have an image and text - they complement each other
    const hasExistingImage = buffer.messages.some(msg => !!msg.imageUrl);
    if (hasExistingImage && newMessage.messageText && !newMessage.imageUrl) {
      logDebug('MESSAGE_BUFFER_IMAGE_CONTEXT', 'Combining text with previous image message', {
        bufferedMessages: buffer.messages.length
      });
      return true;
    }
    
    // If this is an image and we already have text, they likely go together
    const hasExistingText = buffer.messages.some(msg => !!msg.messageText);
    if (hasExistingText && newMessage.imageUrl && !newMessage.messageText) {
      logDebug('MESSAGE_BUFFER_TEXT_CONTEXT', 'Combining image with previous text message', {
        bufferedMessages: buffer.messages.length
      });
      return true;
    }
    
    // If message types are compatible (both text, or continued conversation)
    const areMessageTypesCompatible = (
      (!!newMessage.messageText && buffer.messages.some(m => !!m.messageText)) ||
      (!!newMessage.imageUrl && buffer.messages.some(m => !!m.imageUrl))
    );
    
    return areMessageTypesCompatible;
  }

  /**
   * Transition a buffer to cooldown state after processing
   * @param bufferKey The unique buffer key
   */
  private transitionToCooldown(bufferKey: string): void {
    const buffer = this.buffers.get(bufferKey);
    if (!buffer) return;
    
    // Clear any existing cooldown timeout
    if (buffer.cooldownTimeoutId !== null) {
      clearTimeout(buffer.cooldownTimeoutId);
    }
    
    // Update buffer state
    buffer.state = 'cooldown';
    buffer.lastProcessedAt = Date.now();
    buffer.messages = []; // Clear messages
    buffer.lastProcessingTimestamp = null;
    
    logDebug('MESSAGE_BUFFER_COOLDOWN', 'Buffer transitioned to cooldown state', {
      bufferKey,
      cooldownPeriodMs: this.config.cooldownPeriodMs
    });
    
    // Set timeout to expire the buffer after cooldown period if it remains empty
    buffer.cooldownTimeoutId = setTimeout(() => {
      const currentBuffer = this.buffers.get(bufferKey);
      
      // Only remove if still in cooldown and empty
      if (currentBuffer && 
          currentBuffer.state === 'cooldown' && 
          currentBuffer.messages.length === 0) {
        logDebug('MESSAGE_BUFFER_COOLDOWN_EXPIRED', 'Removing buffer after cooldown period', {
          bufferKey
        });
        
        this.buffers.delete(bufferKey);
      }
    }, this.config.bufferRetentionMs);
  }

  /**
   * Add a message to the buffer for a specific conversation
   * @param message The message data to buffer
   * @param flushCallback Function to call when buffer should be processed
   * @returns True if message was added to buffer, false if buffer is full
   */
  public addMessage(
    message: BufferedMessage,
    flushCallback: (messages: BufferedMessage[]) => Promise<void>
  ): boolean {
    const bufferKey = this.getBufferKey(message.instanceName, message.fromNumber);
    const now = Date.now();
    
    // Start timing this operation for metrics
    const operationStartTime = performance.now();
    
    // Get or create buffer for this conversation
    let buffer = this.buffers.get(bufferKey);
    
    // If we have an existing buffer, check if we should combine with it or process it first
    if (buffer) {
      // If buffer is in processing state, wait for it to finish
      if (buffer.state === 'processing') {
        logDebug('MESSAGE_BUFFER_PROCESSING_WAIT', 'Buffer is currently processing, will add after processing', {
          bufferKey,
          messagePreview: message.messageText?.substring(0, 50) || '[no text]'
        });
        
        // We'll create a new message in this buffer once processing is done
        // For now, just hold on to the message and return success
        // In a full implementation, we would queue this message to be added after processing
        
        // Create a safety timeout to prevent messages getting lost if processing never completes
        setTimeout(() => {
          const currentBuffer = this.buffers.get(bufferKey);
          if (currentBuffer && currentBuffer.state === 'processing') {
            // Force transition to cooldown and then add the message
            this.transitionToCooldown(bufferKey);
            this.addMessage(message, flushCallback);
          }
        }, 5000); // 5 second safety timeout
        
        return true;
      }
      
      // If buffer is in cooldown and we're within debounce window, reactivate it
      if (buffer.state === 'cooldown' && 
          buffer.lastProcessedAt && 
          now - buffer.lastProcessedAt < this.config.debounceTimeMs * 2) {
        
        logDebug('MESSAGE_BUFFER_REACTIVATING', 'Reactivating buffer from cooldown state', {
          bufferKey,
          timeSinceProcessed: buffer.lastProcessedAt ? now - buffer.lastProcessedAt : null,
          cooldownThreshold: this.config.debounceTimeMs * 2
        });
        
        // Clear cooldown timeout
        if (buffer.cooldownTimeoutId !== null) {
          clearTimeout(buffer.cooldownTimeoutId);
          buffer.cooldownTimeoutId = null;
        }
        
        // Reactivate the buffer
        buffer.state = 'active';
      }
      else if (buffer.state === 'cooldown') {
        // Buffer is in cooldown but outside debounce window, create a fresh buffer
        logDebug('MESSAGE_BUFFER_COOLDOWN_EXPIRED', 'Cooldown buffer outside debounce window, creating fresh buffer', {
          bufferKey,
          timeSinceProcessed: buffer.lastProcessedAt ? now - buffer.lastProcessedAt : null,
          cooldownThreshold: this.config.debounceTimeMs * 2
        });
        
        // Clear any timeouts
        if (buffer.timeoutId !== null) {
          clearTimeout(buffer.timeoutId);
        }
        if (buffer.cooldownTimeoutId !== null) {
          clearTimeout(buffer.cooldownTimeoutId);
        }
        
        // Create a fresh buffer
        buffer = {
          messages: [],
          timeoutId: null,
          lastUpdated: now,
          createdAt: now,
          processingAttempts: 0,
          lastProcessingTimestamp: null,
          state: 'active',
          cooldownTimeoutId: null,
          lastProcessedAt: null
        };
        this.buffers.set(bufferKey, buffer);
      }
      
      // Active buffer, check if we should combine or flush first
      if (!this.shouldCombineWithBuffer(buffer, message)) {
        // If messages are not related, process the current buffer first
        logDebug('MESSAGE_BUFFER_CONTEXT_BREAK', 'Message appears to start new context, processing current buffer', {
          bufferKey,
          existingMessages: buffer.messages.length,
          timeSinceLastUpdate: now - buffer.lastUpdated,
          bufferState: buffer.state
        });
        
        // Process the current buffer
        this.flushBuffer(bufferKey, flushCallback);
        
        // Create a new buffer for this message
        buffer = {
          messages: [],
          timeoutId: null,
          lastUpdated: now,
          createdAt: now,
          processingAttempts: 0,
          lastProcessingTimestamp: null,
          state: 'active',
          cooldownTimeoutId: null,
          lastProcessedAt: null
        };
        this.buffers.set(bufferKey, buffer);
      }
    } else {
      // Create a new buffer if none exists
      buffer = {
        messages: [],
        timeoutId: null,
        lastUpdated: now,
        createdAt: now,
        processingAttempts: 0,
        lastProcessingTimestamp: null,
        state: 'active',
        cooldownTimeoutId: null,
        lastProcessedAt: null
      };
      this.buffers.set(bufferKey, buffer);
      
      logDebug('MESSAGE_BUFFER_CREATED', 'Created new conversation buffer', {
        bufferKey,
        fromNumber: message.fromNumber,
        instanceName: message.instanceName
      });
    }
    
    // Check if buffer is full (safety mechanism)
    if (buffer.messages.length >= this.config.maxBufferSize) {
      logDebug('MESSAGE_BUFFER_FULL', 'Buffer is full, processing immediately', {
        bufferKey,
        maxSize: this.config.maxBufferSize,
        messagePreview: message.messageText?.substring(0, 50) || '[no text]',
        operationTime: performance.now() - operationStartTime
      });
      
      // Process the buffer now and reset
      this.flushBuffer(bufferKey, flushCallback);
      
      // Create a new buffer with just this message
      buffer = {
        messages: [message],
        timeoutId: null,
        lastUpdated: now,
        createdAt: now,
        processingAttempts: 0,
        lastProcessingTimestamp: null,
        state: 'active',
        cooldownTimeoutId: null,
        lastProcessedAt: null
      };
      this.buffers.set(bufferKey, buffer);
      
      // Set a new timeout for this message
      this.setBufferTimeout(bufferKey, flushCallback);
      
      return true;
    }
    
    // Add message to buffer
    buffer.messages.push(message);
    buffer.lastUpdated = now;
    
    // Ensure buffer is in active state
    if (buffer.state !== 'active') {
      buffer.state = 'active';
    }
    
    logDebug('MESSAGE_BUFFER_ADDED', 'Added message to buffer', {
      bufferKey,
      currentSize: buffer.messages.length,
      messagePreview: message.messageText?.substring(0, 50) || '[no text]',
      operationTime: performance.now() - operationStartTime,
      bufferState: buffer.state
    });
    
    // Reset the timeout since we have a new message
    if (buffer.timeoutId !== null) {
      clearTimeout(buffer.timeoutId);
    }
    
    // Set a new timeout
    this.setBufferTimeout(bufferKey, flushCallback);
    
    // Update memory usage periodically (every 10 messages)
    if ((this.processedBuffersCount + this.failedProcessingCount) % 10 === 0) {
      this.updateMemoryUsage();
    }
    
    return true;
  }

  /**
   * Set a timeout to process the buffer after debounce period
   * @param bufferKey The unique buffer key
   * @param flushCallback Function to call when timeout expires
   */
  private setBufferTimeout(
    bufferKey: string,
    flushCallback: (messages: BufferedMessage[]) => Promise<void>
  ): void {
    const buffer = this.buffers.get(bufferKey);
    if (!buffer) return;
    
    // Create a new timeout
    const timeoutId = setTimeout(() => {
      this.flushBuffer(bufferKey, flushCallback);
    }, this.config.debounceTimeMs);
    
    // Store the timeout ID
    buffer.timeoutId = timeoutId;
    
    logDebug('MESSAGE_BUFFER_TIMEOUT_SET', 'Set buffer processing timeout', {
      bufferKey,
      debounceTimeMs: this.config.debounceTimeMs,
      messageCount: buffer.messages.length,
      bufferState: buffer.state
    });
  }

  /**
   * Flush a specific buffer and process its messages
   * @param bufferKey The unique buffer key
   * @param flushCallback Function to call with the buffered messages
   */
  public flushBuffer(
    bufferKey: string,
    flushCallback: (messages: BufferedMessage[]) => Promise<void>
  ): void {
    const buffer = this.buffers.get(bufferKey);
    if (!buffer || buffer.messages.length === 0) return;
    
    // Skip if already in processing state
    if (buffer.state === 'processing') {
      logDebug('MESSAGE_BUFFER_ALREADY_PROCESSING', 'Buffer is already being processed', {
        bufferKey,
        messageCount: buffer.messages.length
      });
      return;
    }
    
    const startProcessingTime = performance.now();
    
    logDebug('MESSAGE_BUFFER_FLUSHING', 'Flushing message buffer', {
      bufferKey,
      messageCount: buffer.messages.length,
      bufferAge: Date.now() - buffer.createdAt,
      processingAttempts: buffer.processingAttempts,
      bufferState: buffer.state
    });
    
    // Cancel any pending timeout
    if (buffer.timeoutId !== null) {
      clearTimeout(buffer.timeoutId);
      buffer.timeoutId = null;
    }
    
    // Mark buffer as being processed
    buffer.state = 'processing';
    buffer.lastProcessingTimestamp = Date.now();
    buffer.processingAttempts += 1;
    
    // Clone the messages before processing
    const messages = [...buffer.messages];
    
    // Call the flush callback with the messages
    flushCallback(messages)
      .then(() => {
        // Success: Record metrics and transition buffer to cooldown
        const processingTime = performance.now() - startProcessingTime;
        this.processingTimes.push(processingTime);
        
        // Keep only the last 100 processing times for metrics
        if (this.processingTimes.length > 100) {
          this.processingTimes.shift();
        }
        
        this.processedBuffersCount++;
        
        logDebug('MESSAGE_BUFFER_PROCESSED', 'Successfully processed buffer', {
          bufferKey,
          messageCount: messages.length,
          processingTimeMs: processingTime,
          successRate: this.getSuccessRate()
        });
        
        // Transition buffer to cooldown state instead of removing it
        const currentBuffer = this.buffers.get(bufferKey);
        if (currentBuffer && currentBuffer === buffer) {
          this.transitionToCooldown(bufferKey);
        }
      })
      .catch(error => {
        // Error: Log and potentially retry
        logDebug('MESSAGE_BUFFER_FLUSH_ERROR', 'Error processing buffered messages', {
          bufferKey,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          processingAttempts: buffer.processingAttempts
        });
        
        // If we've tried too many times, give up
        if (buffer.processingAttempts >= this.config.maxProcessingAttempts) {
          this.failedProcessingCount++;
          
          logDebug('MESSAGE_BUFFER_MAX_RETRIES', 'Giving up on buffer after maximum retries', {
            bufferKey,
            maxAttempts: this.config.maxProcessingAttempts,
            messageCount: buffer.messages.length
          });
          
          // Transition to cooldown instead of removing
          this.transitionToCooldown(bufferKey);
        } else {
          // Otherwise, retry after a short delay (exponential backoff)
          const retryDelay = Math.min(1000 * Math.pow(2, buffer.processingAttempts - 1), 10000);
          
          logDebug('MESSAGE_BUFFER_RETRY', 'Will retry processing buffer after delay', {
            bufferKey,
            retryAttempt: buffer.processingAttempts,
            retryDelayMs: retryDelay
          });
          
          // Reset processing state to allow retry
          buffer.state = 'active';
          buffer.lastProcessingTimestamp = null;
          
          // Schedule retry
          buffer.timeoutId = setTimeout(() => {
            this.flushBuffer(bufferKey, flushCallback);
          }, retryDelay);
        }
      });
  }

  /**
   * Calculate the success rate of buffer processing
   * @returns The percentage of successful processing operations
   */
  private getSuccessRate(): number {
    const total = this.processedBuffersCount + this.failedProcessingCount;
    if (total === 0) return 100; // No attempts yet
    
    return (this.processedBuffersCount / total) * 100;
  }

  /**
   * Flush all buffers immediately
   * @param flushCallback Function to call with each buffer's messages
   */
  public flushAllBuffers(
    flushCallback: (messages: BufferedMessage[]) => Promise<void>
  ): void {
    const startTime = performance.now();
    
    logDebug('MESSAGE_BUFFER_FLUSH_ALL', 'Flushing all message buffers', {
      bufferCount: this.buffers.size,
      totalMessages: Array.from(this.buffers.values()).reduce((sum, b) => sum + b.messages.length, 0)
    });
    
    // Create a copy of the keys to avoid modification during iteration
    const bufferKeys = Array.from(this.buffers.keys());
    
    // Flush each buffer
    for (const bufferKey of bufferKeys) {
      const buffer = this.buffers.get(bufferKey);
      if (buffer && buffer.state === 'active' && buffer.messages.length > 0) {
        this.flushBuffer(bufferKey, flushCallback);
      }
    }
    
    logDebug('MESSAGE_BUFFER_FLUSH_ALL_COMPLETE', 'Completed flushing all buffers', {
      bufferCount: bufferKeys.length,
      operationTimeMs: performance.now() - startTime
    });
  }

  /**
   * Get current buffer statistics for monitoring
   * @returns Object with buffer statistics
   */
  public getStats(): BufferStats {
    let totalMessages = 0;
    let oldestBufferTimestamp = Date.now();
    let maxBufferSize = 0;
    let stuckBuffers = 0;
    const now = Date.now();
    
    // Count buffers by state
    const buffersByState: Record<BufferState, number> = {
      active: 0,
      processing: 0,
      cooldown: 0,
      expired: 0
    };
    
    for (const buffer of this.buffers.values()) {
      totalMessages += buffer.messages.length;
      
      // Count by state
      buffersByState[buffer.state]++;
      
      // Track the largest buffer
      if (buffer.messages.length > maxBufferSize) {
        maxBufferSize = buffer.messages.length;
      }
      
      // Track the oldest buffer
      if (buffer.createdAt < oldestBufferTimestamp) {
        oldestBufferTimestamp = buffer.createdAt;
      }
      
      // Track stuck buffers
      if (buffer.state === 'processing' && 
          buffer.lastProcessingTimestamp && 
          now - buffer.lastProcessingTimestamp > this.config.stuckBufferThresholdMs) {
        stuckBuffers++;
      }
    }
    
    // Calculate average processing time
    let averageProcessingTimeMs = null;
    if (this.processingTimes.length > 0) {
      averageProcessingTimeMs = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }
    
    // Update memory usage
    this.updateMemoryUsage();
    
    return {
      totalBuffers: this.buffers.size,
      totalMessages,
      oldestBufferAge: this.buffers.size > 0 ? now - oldestBufferTimestamp : 0,
      averageMessagesPerBuffer: this.buffers.size > 0 ? totalMessages / this.buffers.size : 0,
      maxBufferSize,
      stuckBuffers,
      processingSuccessRate: this.getSuccessRate(),
      averageProcessingTimeMs,
      emergencyFlushes: this.emergencyFlushCount,
      memoryUsageBytes: this.lastMemoryUsage,
      buffersByState
    };
  }

  /**
   * Clean up resources when shutting down
   */
  public destroy(): void {
    // Log final statistics before shutdown
    const finalStats = this.getStats();
    logDebug('MESSAGE_BUFFER_FINAL_STATS', 'Buffer system final statistics before shutdown', finalStats);
    
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear all timeouts
    for (const buffer of this.buffers.values()) {
      if (buffer.timeoutId !== null) {
        clearTimeout(buffer.timeoutId);
      }
      if (buffer.cooldownTimeoutId !== null) {
        clearTimeout(buffer.cooldownTimeoutId);
      }
    }
    
    // Clear all buffers
    this.buffers.clear();
    
    logDebug('MESSAGE_BUFFER_DESTROYED', 'Message buffer system shutdown');
  }
}

// Create a singleton instance for the application to use
export const messageBufferManager = new MessageBufferManager();

// Export the manager for use in the webhook handler
export default messageBufferManager;
