/**
 * Parallel Query Utilities for Supabase Edge Functions
 * 
 * يوفر دوال مساعدة لتنفيذ استعلامات متعددة بالتوازي
 * مع معالجة أخطاء قوية وlogging مفصل
 * 
 * الهدف: تحسين الأداء بنسبة 60-70% عبر تنفيذ الاستعلامات المستقلة بالتوازي
 */

// Logger for debugging and monitoring
const logger = {
  log: (...args: any[]) => console.log('[PARALLEL]', ...args),
  error: (...args: any[]) => console.error('[PARALLEL-ERROR]', ...args),
  info: (...args: any[]) => console.info('[PARALLEL-INFO]', ...args),
  warn: (...args: any[]) => console.warn('[PARALLEL-WARN]', ...args),
  debug: (...args: any[]) => console.debug('[PARALLEL-DEBUG]', ...args),
};

/**
 * Utility function to measure execution time
 */
export function measureTime(label: string) {
  const start = Date.now();
  return {
    end: () => {
      const duration = Date.now() - start;
      logger.info(`⏱️ ${label}: ${duration}ms`);
      return duration;
    }
  };
}

/**
 * Execute multiple queries in parallel using Promise.all
 * Fails fast if any query fails
 * 
 * @param queries Array of promises to execute
 * @param queryNames Optional names for logging
 * @returns Results of all queries
 */
export async function executeParallel<T extends any[]>(
  queries: [...{ [K in keyof T]: Promise<T[K]> }],
  queryNames?: string[]
): Promise<T> {
  const timer = measureTime(`Parallel execution of ${queries.length} queries`);
  
  try {
    logger.info(`Starting parallel execution of ${queries.length} queries`);
    
    if (queryNames) {
      logger.debug('Query names:', queryNames);
    }
    
    const results = await Promise.all(queries);
    
    const duration = timer.end();
    logger.info(`✅ All ${queries.length} queries completed successfully`);
    
    return results as T;
  } catch (error) {
    const duration = timer.end();
    logger.error(`❌ Parallel execution failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Execute multiple queries in parallel using Promise.allSettled
 * Never fails - returns default values for failed queries
 * 
 * @param queries Array of promises to execute
 * @param defaultValues Default values to use if queries fail
 * @param queryNames Optional names for logging
 * @returns Results with defaults for failed queries
 */
export async function executeSafeParallel<T extends any[]>(
  queries: [...{ [K in keyof T]: Promise<T[K]> }],
  defaultValues: T,
  queryNames?: string[]
): Promise<T> {
  const timer = measureTime(`Safe parallel execution of ${queries.length} queries`);
  
  logger.info(`Starting safe parallel execution of ${queries.length} queries`);
  
  if (queryNames && queryNames.length !== queries.length) {
    logger.warn('Query names count does not match queries count');
  }
  
  const results = await Promise.allSettled(queries);
  
  const processedResults = results.map((result, index) => {
    const queryName = queryNames?.[index] || `Query ${index}`;
    
    if (result.status === 'fulfilled') {
      logger.debug(`✅ ${queryName} succeeded`);
      return result.value;
    } else {
      logger.warn(`⚠️ ${queryName} failed:`, result.reason);
      logger.debug(`Using default value for ${queryName}:`, defaultValues[index]);
      return defaultValues[index];
    }
  });
  
  const duration = timer.end();
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failureCount = results.length - successCount;
  
  logger.info(
    `Parallel execution completed: ${successCount}/${queries.length} succeeded` +
    (failureCount > 0 ? ` (${failureCount} failed with defaults)` : '')
  );
  
  return processedResults as T;
}

/**
 * Execute batches of queries sequentially, with each batch running in parallel
 * Useful when you have dependent queries that need to run in stages
 * 
 * @param batches Array of batch configurations
 * @returns Object with results from each batch
 */
export async function executeBatchedParallel<T>(
  batches: Array<{
    name: string;
    queries: Promise<any>[];
    processor?: (results: any[]) => any;
  }>
): Promise<T> {
  const overallTimer = measureTime(`Batched parallel execution of ${batches.length} batches`);
  const results: any = {};
  
  logger.info(`Starting batched execution of ${batches.length} batches`);
  
  for (const [index, batch] of batches.entries()) {
    const batchTimer = measureTime(`Batch ${index + 1}: ${batch.name}`);
    logger.info(`Executing batch ${index + 1}/${batches.length}: ${batch.name}`);
    
    try {
      const batchResults = await Promise.all(batch.queries);
      const processed = batch.processor ? batch.processor(batchResults) : batchResults;
      results[batch.name] = processed;
      
      const batchDuration = batchTimer.end();
      logger.info(`✅ Batch "${batch.name}" completed successfully`);
    } catch (error) {
      const batchDuration = batchTimer.end();
      logger.error(`❌ Batch "${batch.name}" failed:`, error);
      results[batch.name] = null;
      
      // Optionally throw to stop execution on batch failure
      // throw error;
    }
  }
  
  const totalDuration = overallTimer.end();
  const successfulBatches = Object.values(results).filter(r => r !== null).length;
  
  logger.info(
    `All batches completed: ${successfulBatches}/${batches.length} successful`
  );
  
  return results as T;
}

/**
 * Execute queries with a concurrency limit
 * Useful when you have many queries but want to limit database connections
 * 
 * @param queries Array of promise factories (functions that return promises)
 * @param concurrencyLimit Maximum number of concurrent queries
 * @returns Results of all queries
 */
export async function executeWithConcurrencyLimit<T>(
  queries: Array<() => Promise<T>>,
  concurrencyLimit: number = 5
): Promise<T[]> {
  const timer = measureTime(`Limited parallel execution of ${queries.length} queries (limit: ${concurrencyLimit})`);
  
  logger.info(`Starting execution with concurrency limit of ${concurrencyLimit}`);
  
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  
  for (const [index, queryFactory] of queries.entries()) {
    const promise = queryFactory().then(result => {
      results[index] = result;
      logger.debug(`Query ${index + 1}/${queries.length} completed`);
    }).catch(error => {
      logger.error(`Query ${index + 1}/${queries.length} failed:`, error);
      throw error;
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }
  
  await Promise.all(executing);
  
  const duration = timer.end();
  logger.info(`All queries completed with concurrency limit`);
  
  return results;
}

/**
 * Retry a query with exponential backoff
 * Useful for handling transient failures
 * 
 * @param queryFactory Function that returns a promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in milliseconds
 * @returns Query result
 */
export async function executeWithRetry<T>(
  queryFactory: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.info(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const result = await queryFactory();
      
      if (attempt > 0) {
        logger.info(`✅ Query succeeded on retry attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(`Query failed on attempt ${attempt + 1}/${maxRetries + 1}:`, error);
      
      if (attempt === maxRetries) {
        logger.error(`❌ Query failed after all ${maxRetries + 1} attempts`);
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

/**
 * Helper function to create a timeout wrapper for any promise
 * 
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutMessage Custom timeout error message
 * @returns Promise that rejects if timeout is reached
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(timeoutMessage || `Query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Export logger for external use if needed
export { logger as parallelLogger };