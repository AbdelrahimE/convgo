import { Redis } from 'https://deno.land/x/upstash_redis@v1.19.3/mod.ts';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Upstash Redis client instance
let redisClient: Redis | null = null;

/**
 * Initialize and get Redis client
 * Returns null if Redis is not configured or fails to initialize
 */
export function getRedisClient(): Redis | null {
  try {
    // Check if already initialized
    if (redisClient) {
      return redisClient;
    }

    // Get Upstash credentials from environment
    const upstashUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const upstashToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

    if (!upstashUrl || !upstashToken) {
      logger.warn('Upstash Redis credentials not configured - buffering system disabled');
      return null;
    }

    // Initialize Redis client
    redisClient = new Redis({
      url: upstashUrl,
      token: upstashToken,
    });

    logger.info('Upstash Redis client initialized successfully');
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Upstash Redis client:', error);
    return null;
  }
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    // Test with a simple ping
    const result = await client.ping();
    logger.info('Redis connection test successful:', result);
    return true;
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    return false;
  }
}

/**
 * Safely execute Redis command with error handling
 */
export async function safeRedisCommand<T>(
  operation: (client: Redis) => Promise<T>,
  fallbackValue: T
): Promise<T> {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis client not available, using fallback');
      return fallbackValue;
    }

    return await operation(client);
  } catch (error) {
    logger.error('Redis command failed, using fallback:', error);
    return fallbackValue;
  }
}