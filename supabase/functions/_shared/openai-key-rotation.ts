
// Utility to manage OpenAI API key rotation
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

let currentKeyIndex = 0;

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

    // Get next key in rotation
    const key = keys[currentKeyIndex];
    
    // Update index for next call, wrapping around to 0 if we hit the end
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    
    logger.info(`Using OpenAI API key ${currentKeyIndex} of ${keys.length}`);
    
    return key;
  } catch (error) {
    logger.error('Error getting next OpenAI API key:', error);
    throw error;
  }
}
