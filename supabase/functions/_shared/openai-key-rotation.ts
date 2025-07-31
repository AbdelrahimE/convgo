
// Utility to manage OpenAI API key rotation
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

export function getNextOpenAIKey(): string {
  try {
    // Get all OpenAI API keys from environment variables
    const keys: string[] = [];
    
    // Add the base key first
    const baseKey = Deno.env.get('OPENAI_API_KEY');
    if (baseKey) keys.push(baseKey);
    
    // Add numbered keys
    for (let i = 1; i <= 9; i++) {
      const key = Deno.env.get(`OPENAI_API_KEY${i}`);
      if (key) keys.push(key);
    }

    if (keys.length === 0) {
      logger.error('No OpenAI API keys found in environment variables');
      throw new Error('No OpenAI API keys configured');
    }

    // Use timestamp-based rotation with 5-second intervals
    const currentKeyIndex = Math.floor(Date.now() / (5 * 1000)) % keys.length;
    
    // Get key based on current time slot
    const key = keys[currentKeyIndex];
    
    logger.info(`Using OpenAI API key ${currentKeyIndex + 1} of ${keys.length}`);
    
    return key;
  } catch (error) {
    logger.error('Error getting next OpenAI API key:', error);
    throw error;
  }
}
