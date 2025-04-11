
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

export interface ConversationBuffer {
  messages: BufferedMessage[];  // Array of buffered messages
  timeoutId: number | null;     // The debounce timeout ID
  lastUpdated: number;          // Timestamp of last buffer update
}

// Configuration options with safe defaults
export interface BufferConfig {
  debounceTimeMs: number;     // How long to wait before processing (default: 5000ms)
  maxBufferSize: number;      // Maximum messages per conversation (safety limit)
  maxBufferAgeMs: number;     // Maximum age of any buffer before forced processing
  cleanupIntervalMs: number;  // How often to check for stale buffers
}

// Default configuration
const DEFAULT_CONFIG: BufferConfig = {
  debounceTimeMs: 5000,      // 5 seconds debounce time
  maxBufferSize: 10,         // Maximum 10 messages per conversation buffer
  maxBufferAgeMs: 30000,     // Force process after 30 seconds (failsafe)
  cleanupIntervalMs: 60000,  // Check for stale buffers every 60 seconds
};

/**
 * Message Buffer Manager for WhatsApp conversations
 * Implements debounce pattern to group closely timed messages
 */
export class MessageBufferManager {
  private buffers: Map<string, ConversationBuffer>;
  private config: BufferConfig;
  private cleanupInterval: number | null;

  /**
   * Create a new MessageBufferManager
   * @param config Optional configuration to override defaults
   */
  constructor(config: Partial<BufferConfig> = {}) {
    this.buffers = new Map<string, ConversationBuffer>();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = null;
    
    // Start the cleanup interval
    this.startCleanupInterval();
    
    // Log buffer creation
    logDebug('MESSAGE_BUFFER_CREATED', 'Message buffer system initialized', {
      config: this.config
    });
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
   * Clean up stale buffers to prevent memory leaks
   */
  private cleanupStaleBuffers(): void {
    const now = Date.now();
    let cleanedBuffers = 0;
    
    for (const [key, buffer] of this.buffers.entries()) {
      // If buffer is too old, process it and remove
      if (now - buffer.lastUpdated > this.config.maxBufferAgeMs) {
        // Process the buffer if it has messages
        if (buffer.messages.length > 0) {
          logDebug('MESSAGE_BUFFER_STALE', 'Processing stale buffer', {
            bufferKey: key,
            messageCount: buffer.messages.length,
            bufferAge: now - buffer.lastUpdated
          });
          
          // Cancel any pending timeout
          if (buffer.timeoutId !== null) {
            clearTimeout(buffer.timeoutId);
          }
          
          // We would call processBuffer here, but will implement in Stage 2
          // For now, just remove it
          this.buffers.delete(key);
          cleanedBuffers++;
        } else {
          // Empty buffer, just remove it
          this.buffers.delete(key);
          cleanedBuffers++;
        }
      }
    }
    
    if (cleanedBuffers > 0) {
      logDebug('MESSAGE_BUFFER_CLEANUP', 'Cleaned up stale buffers', {
        cleanedCount: cleanedBuffers,
        remainingBuffers: this.buffers.size
      });
    }
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
    
    // Get or create buffer for this conversation
    let buffer = this.buffers.get(bufferKey);
    if (!buffer) {
      buffer = {
        messages: [],
        timeoutId: null,
        lastUpdated: now
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
        messagePreview: message.messageText?.substring(0, 50) || '[no text]'
      });
      
      // Process the buffer now and reset
      this.flushBuffer(bufferKey, flushCallback);
      
      // Create a new buffer with just this message
      buffer = {
        messages: [message],
        timeoutId: null,
        lastUpdated: now
      };
      this.buffers.set(bufferKey, buffer);
      
      // Set a new timeout for this message
      this.setBufferTimeout(bufferKey, flushCallback);
      
      return true;
    }
    
    // Add message to buffer
    buffer.messages.push(message);
    buffer.lastUpdated = now;
    
    logDebug('MESSAGE_BUFFER_ADDED', 'Added message to buffer', {
      bufferKey,
      currentSize: buffer.messages.length,
      messagePreview: message.messageText?.substring(0, 50) || '[no text]'
    });
    
    // Reset the timeout since we have a new message
    if (buffer.timeoutId !== null) {
      clearTimeout(buffer.timeoutId);
    }
    
    // Set a new timeout
    this.setBufferTimeout(bufferKey, flushCallback);
    
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
      messageCount: buffer.messages.length
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
    
    logDebug('MESSAGE_BUFFER_FLUSHING', 'Flushing message buffer', {
      bufferKey,
      messageCount: buffer.messages.length
    });
    
    // Cancel any pending timeout
    if (buffer.timeoutId !== null) {
      clearTimeout(buffer.timeoutId);
    }
    
    // Clone the messages before removing the buffer
    const messages = [...buffer.messages];
    
    // Remove the buffer
    this.buffers.delete(bufferKey);
    
    // Call the flush callback with the messages
    flushCallback(messages).catch(error => {
      logDebug('MESSAGE_BUFFER_FLUSH_ERROR', 'Error processing buffered messages', {
        bufferKey,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    });
  }

  /**
   * Flush all buffers immediately
   * @param flushCallback Function to call with each buffer's messages
   */
  public flushAllBuffers(
    flushCallback: (messages: BufferedMessage[]) => Promise<void>
  ): void {
    logDebug('MESSAGE_BUFFER_FLUSH_ALL', 'Flushing all message buffers', {
      bufferCount: this.buffers.size
    });
    
    // Create a copy of the keys to avoid modification during iteration
    const bufferKeys = Array.from(this.buffers.keys());
    
    // Flush each buffer
    for (const bufferKey of bufferKeys) {
      this.flushBuffer(bufferKey, flushCallback);
    }
  }

  /**
   * Get current buffer statistics for monitoring
   * @returns Object with buffer statistics
   */
  public getStats(): {
    totalBuffers: number;
    totalMessages: number;
    oldestBufferAge: number;
  } {
    let totalMessages = 0;
    let oldestBufferTimestamp = Date.now();
    
    for (const buffer of this.buffers.values()) {
      totalMessages += buffer.messages.length;
      if (buffer.lastUpdated < oldestBufferTimestamp) {
        oldestBufferTimestamp = buffer.lastUpdated;
      }
    }
    
    return {
      totalBuffers: this.buffers.size,
      totalMessages,
      oldestBufferAge: Date.now() - oldestBufferTimestamp
    };
  }

  /**
   * Clean up resources when shutting down
   */
  public destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear all timeouts
    for (const buffer of this.buffers.values()) {
      if (buffer.timeoutId !== null) {
        clearTimeout(buffer.timeoutId);
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
