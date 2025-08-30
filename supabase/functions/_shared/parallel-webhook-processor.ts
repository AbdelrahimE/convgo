import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Logger for debugging
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Configuration for parallel processing
interface ParallelProcessorConfig {
  maxConcurrentMessages: number;
  maxConcurrentInstances: number;
  maxQueueSize: number;
  processingTimeoutMs: number;
  enableFallbackMode: boolean;
}

// Default configuration
const DEFAULT_CONFIG: ParallelProcessorConfig = {
  maxConcurrentMessages: 10, // المعالجة المتوازية لـ 10 رسائل كحد أقصى
  maxConcurrentInstances: 5, // 5 instances مختلفة بشكل متوازي
  maxQueueSize: 50, // طابور مؤقت للأحمال العالية
  processingTimeoutMs: 30000, // 30 ثانية كحد أقصى للمعالجة
  enableFallbackMode: true // العودة للنظام القديم عند المشاكل
};

// Webhook processing task interface
interface WebhookTask {
  id: string;
  instanceName: string;
  userPhone?: string;
  event: string;
  data: any;
  processFunction: () => Promise<any>;
  timestamp: number;
  priority: number; // 1 = high, 2 = normal, 3 = low
}

// Processing statistics for monitoring
interface ProcessingStats {
  totalProcessed: number;
  currentlyProcessing: number;
  queuedTasks: number;
  averageProcessingTime: number;
  errorRate: number;
  lastUpdated: Date;
}

/**
 * ParallelWebhookProcessor
 * 
 * نظام معالجة متوازية للـ webhooks مع الحفاظ على الأمان والثبات:
 * - معالجة متوازية للـ instances مختلفة
 * - معالجة تتابعية للنفس user+instance (لمنع race conditions)
 * - queue مؤقت للأحمال العالية
 * - fallback للنظام القديم
 * - monitoring ومراقبة الأداء
 */
export class ParallelWebhookProcessor {
  private config: ParallelProcessorConfig;
  private taskQueue: WebhookTask[] = [];
  private processingTasks: Map<string, WebhookTask> = new Map();
  private instanceLocks: Map<string, Set<string>> = new Map(); // instance -> set of userPhones being processed
  private stats: ProcessingStats;
  private isShuttingDown: boolean = false;
  
  constructor(config?: Partial<ParallelProcessorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalProcessed: 0,
      currentlyProcessing: 0,
      queuedTasks: 0,
      averageProcessingTime: 0,
      errorRate: 0,
      lastUpdated: new Date()
    };
    
    logger.info('ParallelWebhookProcessor initialized', {
      config: this.config
    });
  }

  /**
   * معالجة webhook بشكل متوازي مع الحفاظ على الأمان
   */
  async processWebhook(
    instanceName: string,
    event: string,
    data: any,
    processFunction: () => Promise<any>,
    options: {
      userPhone?: string;
      priority?: number;
    } = {}
  ): Promise<{ success: boolean; usedParallel: boolean; message: string }> {
    
    try {
      // التحقق من حالة النظام
      if (this.isShuttingDown) {
        logger.warn('System is shutting down, falling back to immediate processing');
        return this.fallbackToImmediate(processFunction);
      }

      // إنشاء مهمة معالجة
      const task: WebhookTask = {
        id: `${instanceName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        instanceName,
        userPhone: options.userPhone,
        event,
        data,
        processFunction,
        timestamp: Date.now(),
        priority: options.priority || 2
      };

      logger.info('Processing webhook task', {
        taskId: task.id,
        instanceName,
        event,
        userPhone: options.userPhone,
        queueSize: this.taskQueue.length,
        currentlyProcessing: this.processingTasks.size
      });

      // التحقق من الحمولة الحالية
      if (this.shouldFallback()) {
        logger.warn('System overloaded, falling back to immediate processing', {
          queueSize: this.taskQueue.length,
          processing: this.processingTasks.size,
          config: this.config
        });
        return this.fallbackToImmediate(processFunction);
      }

      // التحقق من locks للنفس instance+user
      const lockKey = this.getLockKey(instanceName, options.userPhone);
      if (this.isLocked(lockKey)) {
        logger.info('Instance+User is locked, queuing task', {
          taskId: task.id,
          lockKey
        });
        return this.queueTask(task);
      }

      // معالجة فورية إذا كان هناك مجال
      if (this.canProcessImmediately()) {
        return this.processTaskImmediately(task);
      }

      // إضافة للقائمة الانتظار
      return this.queueTask(task);

    } catch (error) {
      logger.error('Error in parallel webhook processor', {
        error: error.message || error,
        instanceName,
        event
      });
      
      // Fallback في حالة الخطأ
      return this.fallbackToImmediate(processFunction);
    }
  }

  /**
   * معالجة المهمة فوراً
   */
  private async processTaskImmediately(task: WebhookTask): Promise<{ success: boolean; usedParallel: boolean; message: string }> {
    const lockKey = this.getLockKey(task.instanceName, task.userPhone);
    
    try {
      // إقفال المورد
      this.acquireLock(lockKey);
      this.processingTasks.set(task.id, task);
      this.updateStats();

      logger.info('Processing task immediately', {
        taskId: task.id,
        lockKey,
        currentlyProcessing: this.processingTasks.size
      });

      // معالجة المهمة مع timeout
      const startTime = Date.now();
      const result = await Promise.race([
        task.processFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeoutMs)
        )
      ]);

      const processingTime = Date.now() - startTime;
      
      // تحديث الإحصائيات
      this.stats.totalProcessed++;
      this.updateAverageProcessingTime(processingTime);
      
      logger.info('Task processed successfully', {
        taskId: task.id,
        processingTime,
        result: !!result
      });

      return {
        success: true,
        usedParallel: true,
        message: 'Processed with parallel system'
      };

    } catch (error) {
      this.stats.errorRate++;
      logger.error('Task processing failed', {
        taskId: task.id,
        error: error.message || error
      });

      // محاولة fallback في حالة الفشل
      logger.info('Attempting fallback processing for failed task', { taskId: task.id });
      return this.fallbackToImmediate(task.processFunction);

    } finally {
      // إزالة الأقفال والمهام
      this.releaseLock(lockKey);
      this.processingTasks.delete(task.id);
      this.updateStats();
      
      // معالجة المهام المنتظرة
      this.processQueuedTasks();
    }
  }

  /**
   * إضافة مهمة لقائمة الانتظار
   */
  private async queueTask(task: WebhookTask): Promise<{ success: boolean; usedParallel: boolean; message: string }> {
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      logger.warn('Queue is full, falling back to immediate processing', {
        taskId: task.id,
        queueSize: this.taskQueue.length
      });
      return this.fallbackToImmediate(task.processFunction);
    }

    // إضافة للقائمة مع الترتيب حسب الأولوية
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => a.priority - b.priority);
    this.updateStats();

    logger.info('Task queued successfully', {
      taskId: task.id,
      queuePosition: this.taskQueue.findIndex(t => t.id === task.id) + 1,
      queueSize: this.taskQueue.length
    });

    // محاولة معالجة المهام المنتظرة
    setTimeout(() => this.processQueuedTasks(), 100);

    return {
      success: true,
      usedParallel: true,
      message: 'Task queued for parallel processing'
    };
  }

  /**
   * معالجة المهام المنتظرة في القائمة
   */
  private async processQueuedTasks(): Promise<void> {
    while (this.taskQueue.length > 0 && this.canProcessImmediately()) {
      const task = this.taskQueue.shift();
      if (!task) break;

      const lockKey = this.getLockKey(task.instanceName, task.userPhone);
      if (this.isLocked(lockKey)) {
        // إعادة المهمة للقائمة إذا كانت مقفلة
        this.taskQueue.unshift(task);
        break;
      }

      // معالجة المهمة بدون انتظار النتيجة (fire and forget)
      this.processTaskImmediately(task).catch(error => {
        logger.error('Queued task processing failed', {
          taskId: task.id,
          error: error.message || error
        });
      });
    }
  }

  /**
   * العودة للمعالجة الفورية (النظام القديم)
   */
  private async fallbackToImmediate(processFunction: () => Promise<any>): Promise<{ success: boolean; usedParallel: boolean; message: string }> {
    try {
      logger.info('Using fallback immediate processing');
      const result = await processFunction();
      
      return {
        success: !!result,
        usedParallel: false,
        message: 'Processed with fallback system'
      };
    } catch (error) {
      logger.error('Fallback processing failed', {
        error: error.message || error
      });
      
      return {
        success: false,
        usedParallel: false,
        message: 'Fallback processing failed'
      };
    }
  }

  /**
   * دوال مساعدة لإدارة الأقفال والحالات
   */
  private getLockKey(instanceName: string, userPhone?: string): string {
    return userPhone ? `${instanceName}:${userPhone}` : instanceName;
  }

  private isLocked(lockKey: string): boolean {
    const [instanceName, userPhone] = lockKey.split(':');
    const instanceLocks = this.instanceLocks.get(instanceName);
    return instanceLocks ? instanceLocks.has(userPhone || 'default') : false;
  }

  private acquireLock(lockKey: string): void {
    const [instanceName, userPhone] = lockKey.split(':');
    if (!this.instanceLocks.has(instanceName)) {
      this.instanceLocks.set(instanceName, new Set());
    }
    this.instanceLocks.get(instanceName)!.add(userPhone || 'default');
  }

  private releaseLock(lockKey: string): void {
    const [instanceName, userPhone] = lockKey.split(':');
    const instanceLocks = this.instanceLocks.get(instanceName);
    if (instanceLocks) {
      instanceLocks.delete(userPhone || 'default');
      if (instanceLocks.size === 0) {
        this.instanceLocks.delete(instanceName);
      }
    }
  }

  private canProcessImmediately(): boolean {
    return this.processingTasks.size < this.config.maxConcurrentMessages;
  }

  private shouldFallback(): boolean {
    return !this.config.enableFallbackMode ||
           this.taskQueue.length >= this.config.maxQueueSize ||
           this.processingTasks.size >= this.config.maxConcurrentMessages;
  }

  private updateStats(): void {
    this.stats.currentlyProcessing = this.processingTasks.size;
    this.stats.queuedTasks = this.taskQueue.length;
    this.stats.lastUpdated = new Date();
  }

  private updateAverageProcessingTime(newTime: number): void {
    const currentAvg = this.stats.averageProcessingTime;
    const totalProcessed = this.stats.totalProcessed;
    this.stats.averageProcessingTime = 
      (currentAvg * (totalProcessed - 1) + newTime) / totalProcessed;
  }

  /**
   * الحصول على إحصائيات النظام
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * إيقاف النظام بأمان
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down ParallelWebhookProcessor');
    this.isShuttingDown = true;

    // انتظار انتهاء المهام الحالية
    while (this.processingTasks.size > 0) {
      logger.info('Waiting for tasks to complete', {
        remaining: this.processingTasks.size
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // مسح القائمة
    this.taskQueue = [];
    this.processingTasks.clear();
    this.instanceLocks.clear();

    logger.info('ParallelWebhookProcessor shutdown complete');
  }
}

// إنشاء instance واحد مشترك للاستخدام
export const globalParallelProcessor = new ParallelWebhookProcessor();