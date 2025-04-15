
/**
 * Utility for managing Evolution API key rotation
 */

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

/**
 * Get all available Evolution API keys
 */
function getAllApiKeys(): string[] {
  const keys: string[] = [];
  
  // Get the base key first
  const baseKey = Deno.env.get('EVOLUTION_API_KEY');
  if (baseKey) keys.push(baseKey);
  
  // Get numbered keys (1-9)
  for (let i = 1; i <= 9; i++) {
    const key = Deno.env.get(`EVOLUTION_API_KEY${i}`);
    if (key) keys.push(key);
  }
  
  return keys;
}

let currentKeyIndex = 0;
let availableKeys: string[] = [];

/**
 * Get the next available API key in rotation
 * @returns The next API key to use
 */
export function getNextApiKey(): string {
  try {
    // Lazy load keys if not already loaded
    if (availableKeys.length === 0) {
      availableKeys = getAllApiKeys();
      logger.info(`Loaded ${availableKeys.length} Evolution API keys`);
    }

    // If no keys available, throw error
    if (availableKeys.length === 0) {
      throw new Error('No Evolution API keys available');
    }

    // Get next key and update index
    const key = availableKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % availableKeys.length;
    
    logger.debug(`Using Evolution API key ${currentKeyIndex + 1}/${availableKeys.length}`);
    return key;
  } catch (error) {
    logger.error('Error getting next API key:', error);
    // Fallback to base key if available
    const fallbackKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!fallbackKey) {
      throw new Error('No Evolution API keys available, including fallback');
    }
    return fallbackKey;
  }
}

/**
 * Reset the key rotation to start from the beginning
 */
export function resetKeyRotation(): void {
  currentKeyIndex = 0;
  availableKeys = [];
}

