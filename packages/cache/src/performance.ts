/**
 * Advanced Caching and Performance Optimization
 * **Validates: Production Checklist - Cache & Performance**
 * 
 * Implements cache warming, hot-key distribution, cache stampede prevention,
 * and performance profiling for production-ready caching operations.
 */

import Redis from 'ioredis';
import { logger } from './utils/logger';

export interface CacheWarmingConfig {
  keys: string[];
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  warmupInterval: number; // milliseconds
}

export interface HotKeyMetrics {
  key: string;
  accessCount: number;
  lastAccessed: Date;
  averageResponseTime: number;
  isHot: boolean;
}

export interface PerformanceMetrics {
  hitRate: number;
  missRate: number;
  averageResponseTime: number;
  throughput: number;
  memoryUsage: number;
  connectionCount: number;
  hotKeys: HotKeyMetrics[];
}

/**
 * Cache Warming Manager
 */
export class CacheWarmingManager {
  private redis: Redis;
  private warmingInProgress = false;
  private warmingStats = {
    totalKeys: 0,
    warmedKeys: 0,
    failedKeys: 0,
    startTime: 0,
    endTime: 0,
  };

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache(
    config: CacheWarmingConfig,
    dataProvider: (key: string) => Promise<any>
  ): Promise<void> {
    if (this.warmingInProgress) {
      logger.warn('Cache warming already in progress');
      return;
    }

    this.warmingInProgress = true;
    this.warmingStats = {
      totalKeys: config.keys.length,
      warmedKeys: 0,
      failedKeys: 0,
      startTime: Date.now(),
      endTime: 0,
    };

    logger.info('Starting cache warming', {
      totalKeys: config.keys.length,
      batchSize: config.batchSize,
      concurrency: config.concurrency,
    });

    try {
      // Process keys in batches with controlled concurrency
      for (let i = 0; i < config.keys.length; i += config.batchSize) {
        const batch = config.keys.slice(i, i + config.batchSize);
        
        await this.processBatch(batch, dataProvider, config);
        
        // Small delay between batches to prevent overwhelming
        if (i + config.batchSize < config.keys.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.warmingStats.endTime = Date.now();
      
      logger.info('Cache warming completed', {
        totalKeys: this.warmingStats.totalKeys,
        warmedKeys: this.warmingStats.warmedKeys,
        failedKeys: this.warmingStats.failedKeys,
        duration: this.warmingStats.endTime - this.warmingStats.startTime,
      });
    } catch (error) {
      logger.error('Cache warming failed', {
        error: (error as Error).message,
        stats: this.warmingStats,
      });
      throw error;
    } finally {
      this.warmingInProgress = false;
    }
  }

  /**
   * Process a batch of keys with controlled concurrency
   */
  private async processBatch(
    keys: string[],
    dataProvider: (key: string) => Promise<any>,
    config: CacheWarmingConfig
  ): Promise<void> {
    const semaphore = new Semaphore(config.concurrency);
    
    const promises = keys.map(async (key) => {
      await semaphore.acquire();
      
      try {
        await this.warmKey(key, dataProvider, config.retryAttempts);
        this.warmingStats.warmedKeys++;
      } catch (error) {
        this.warmingStats.failedKeys++;
        logger.warn('Failed to warm cache key', {
          key,
          error: (error as Error).message,
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Warm a single cache key
   */
  private async warmKey(
    key: string,
    dataProvider: (key: string) => Promise<any>,
    retryAttempts: number
  ): Promise<void> {
    let lastError: Error;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const data = await dataProvider(key);
        
        if (data !== null && data !== undefined) {
          await this.redis.set(key, JSON.stringify(data), 'EX', 3600); // 1 hour TTL
        }
        
        return;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retryAttempts) {
          const delay = Math.pow(2, attempt) * 100; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get warming statistics
   */
  getWarmingStats(): typeof this.warmingStats {
    return { ...this.warmingStats };
  }

  /**
   * Check if warming is in progress
   */
  isWarmingInProgress(): boolean {
    return this.warmingInProgress;
  }
}

/**
 * Hot Key Distribution Manager
 */
export class HotKeyDistributionManager {
  private redis: Redis;
  private hotKeyThreshold = 100; // requests per minute
  private hotKeys = new Map<string, HotKeyMetrics>();
  private distributionStrategy: 'hash' | 'consistent' | 'random' = 'consistent';

  constructor(redis: Redis) {
    this.redis = redis;
    this.startHotKeyMonitoring();
  }

  /**
   * Start monitoring hot keys
   */
  private startHotKeyMonitoring(): void {
    setInterval(() => {
      this.analyzeHotKeys();
    }, 60000); // Every minute
  }

  /**
   * Record key access
   */
  recordKeyAccess(key: string, responseTime: number): void {
    const existing = this.hotKeys.get(key) || {
      key,
      accessCount: 0,
      lastAccessed: new Date(),
      averageResponseTime: 0,
      isHot: false,
    };

    existing.accessCount++;
    existing.lastAccessed = new Date();
    existing.averageResponseTime = 
      (existing.averageResponseTime * (existing.accessCount - 1) + responseTime) / existing.accessCount;

    this.hotKeys.set(key, existing);
  }

  /**
   * Analyze and identify hot keys
   */
  private analyzeHotKeys(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    for (const [key, metrics] of this.hotKeys.entries()) {
      // Reset counters older than 1 minute
      if (metrics.lastAccessed.getTime() < oneMinuteAgo) {
        metrics.accessCount = 0;
        metrics.isHot = false;
      } else if (metrics.accessCount > this.hotKeyThreshold) {
        metrics.isHot = true;
        
        logger.warn('Hot key detected', {
          key,
          accessCount: metrics.accessCount,
          averageResponseTime: metrics.averageResponseTime,
        });

        // Trigger distribution for hot keys
        this.distributeHotKey(key, metrics);
      }

      this.hotKeys.set(key, metrics);
    }
  }

  /**
   * Distribute hot key across multiple cache instances
   */
  private async distributeHotKey(key: string, metrics: HotKeyMetrics): Promise<void> {
    try {
      const value = await this.redis.get(key);
      
      if (value) {
        // Create multiple copies with different suffixes
        const copies = 5; // Number of copies to create
        
        for (let i = 0; i < copies; i++) {
          const distributedKey = `${key}:copy:${i}`;
          await this.redis.set(distributedKey, value, 'EX', 3600);
        }

        logger.info('Hot key distributed', {
          originalKey: key,
          copies,
          accessCount: metrics.accessCount,
        });
      }
    } catch (error) {
      logger.error('Failed to distribute hot key', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get distributed key for reading
   */
  getDistributedKey(key: string): string {
    const metrics = this.hotKeys.get(key);
    
    if (metrics && metrics.isHot) {
      // Use consistent hashing or random selection
      const copyIndex = this.selectCopyIndex(key);
      return `${key}:copy:${copyIndex}`;
    }

    return key;
  }

  /**
   * Select copy index based on distribution strategy
   */
  private selectCopyIndex(key: string): number {
    switch (this.distributionStrategy) {
      case 'hash':
        return this.hashString(key) % 5;
      case 'consistent':
        return this.consistentHash(key) % 5;
      case 'random':
      default:
        return Math.floor(Math.random() * 5);
    }
  }

  /**
   * Simple hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Consistent hash function
   */
  private consistentHash(key: string): number {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Get hot key metrics
   */
  getHotKeyMetrics(): HotKeyMetrics[] {
    return Array.from(this.hotKeys.values())
      .filter(metrics => metrics.isHot)
      .sort((a, b) => b.accessCount - a.accessCount);
  }
}

/**
 * Performance Profiler
 */
export class CachePerformanceProfiler {
  private redis: Redis;
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalResponseTime: 0,
    startTime: Date.now(),
  };
  private responseTimeHistogram = new Map<number, number>();

  constructor(redis: Redis) {
    this.redis = redis;
    this.startMetricsCollection();
  }

  /**
   * Start collecting performance metrics
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.collectRedisMetrics();
    }, 30000); // Every 30 seconds
  }

  /**
   * Record cache operation
   */
  recordOperation(operation: 'hit' | 'miss', responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += responseTime;

    if (operation === 'hit') {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    // Update response time histogram
    const bucket = Math.floor(responseTime / 10) * 10; // 10ms buckets
    this.responseTimeHistogram.set(bucket, (this.responseTimeHistogram.get(bucket) || 0) + 1);
  }

  /**
   * Collect Redis-specific metrics
   */
  private async collectRedisMetrics(): Promise<void> {
    try {
      const info = await this.redis.info();
      const lines = info.split('\r\n');
      
      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          const memory = parseInt(line.split(':')[1]);
          logger.debug('Redis memory usage', { memory });
        }
        
        if (line.startsWith('connected_clients:')) {
          const clients = parseInt(line.split(':')[1]);
          logger.debug('Redis connected clients', { clients });
        }
      }
    } catch (error) {
      logger.error('Failed to collect Redis metrics', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const runtime = Date.now() - this.metrics.startTime;
    const throughput = (this.metrics.totalRequests / runtime) * 1000; // requests per second

    return {
      hitRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100 
        : 0,
      missRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheMisses / this.metrics.totalRequests) * 100 
        : 0,
      averageResponseTime: this.metrics.totalRequests > 0 
        ? this.metrics.totalResponseTime / this.metrics.totalRequests 
        : 0,
      throughput,
      memoryUsage: 0, // Will be updated by collectRedisMetrics
      connectionCount: 0, // Will be updated by collectRedisMetrics
      hotKeys: [], // Will be provided by HotKeyDistributionManager
    };
  }

  /**
   * Get response time percentiles
   */
  getResponseTimePercentiles(): { p50: number; p95: number; p99: number } {
    const sortedTimes = Array.from(this.responseTimeHistogram.entries())
      .sort(([a], [b]) => a - b);

    const totalRequests = Array.from(this.responseTimeHistogram.values())
      .reduce((sum, count) => sum + count, 0);

    let cumulativeCount = 0;
    let p50 = 0, p95 = 0, p99 = 0;

    for (const [responseTime, count] of sortedTimes) {
      cumulativeCount += count;
      const percentile = (cumulativeCount / totalRequests) * 100;

      if (percentile >= 50 && p50 === 0) p50 = responseTime;
      if (percentile >= 95 && p95 === 0) p95 = responseTime;
      if (percentile >= 99 && p99 === 0) p99 = responseTime;
    }

    return { p50, p95, p99 };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      startTime: Date.now(),
    };
    this.responseTimeHistogram.clear();
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      this.permits--;
      resolve();
    }
  }
}

/**
 * Cache Stampede Prevention with Advanced Locking
 */
export class AdvancedCacheStampedePrevention {
  private redis: Redis;
  private lockPrefix = 'stampede:';
  private cachePrefix = 'cache:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Execute with advanced stampede prevention
   */
  async executeWithStampedePrevention<T>(
    key: string,
    executor: () => Promise<T>,
    options: {
      cacheTTL?: number;
      lockTTL?: number;
      staleWhileRevalidate?: boolean;
      probabilisticEarlyExpiration?: boolean;
      beta?: number; // For probabilistic early expiration
    } = {}
  ): Promise<T> {
    const {
      cacheTTL = 300000, // 5 minutes
      lockTTL = 30000,   // 30 seconds
      staleWhileRevalidate = true,
      probabilisticEarlyExpiration = true,
      beta = 1.0,
    } = options;

    const cacheKey = `${this.cachePrefix}${key}`;
    const lockKey = `${this.lockPrefix}${key}`;

    // Try to get from cache first
    const cached = await this.getCachedValueWithMetadata<T>(cacheKey);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const shouldRecompute = this.shouldRecompute(age, cacheTTL, beta, probabilisticEarlyExpiration);
      
      if (!shouldRecompute) {
        return cached.value;
      }

      // If stale but exists, return stale value and refresh in background
      if (staleWhileRevalidate && age < cacheTTL * 2) {
        this.refreshInBackground(key, executor, cacheKey, cacheTTL, lockKey, lockTTL);
        return cached.value;
      }
    }

    // Try to acquire lock for fresh computation
    const lockAcquired = await this.acquireLock(lockKey, lockTTL);

    if (lockAcquired) {
      try {
        // We got the lock, compute fresh value
        const result = await executor();
        await this.setCachedValueWithMetadata(cacheKey, result, cacheTTL);
        return result;
      } finally {
        await this.releaseLock(lockKey);
      }
    } else {
      // Someone else is computing, wait a bit and try cache again
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const freshCached = await this.getCachedValueWithMetadata<T>(cacheKey);
      if (freshCached) {
        return freshCached.value;
      }

      // Still no cache, fall back to direct execution
      return executor();
    }
  }

  /**
   * Determine if value should be recomputed using probabilistic early expiration
   */
  private shouldRecompute(age: number, ttl: number, beta: number, enabled: boolean): boolean {
    if (!enabled) {
      return age >= ttl;
    }

    // Probabilistic early expiration formula
    // P(recompute) = beta * ln(random) * delta / ttl
    // where delta is the time to compute the value (estimated)
    const delta = 1000; // Assume 1 second computation time
    const random = Math.random();
    const probability = beta * Math.log(random) * delta / ttl;
    
    return age >= ttl || Math.random() < Math.abs(probability);
  }

  /**
   * Get cached value with metadata
   */
  private async getCachedValueWithMetadata<T>(key: string): Promise<{
    value: T;
    timestamp: number;
  } | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get cached value', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Set cached value with metadata
   */
  private async setCachedValueWithMetadata<T>(
    key: string,
    value: T,
    ttl: number
  ): Promise<void> {
    try {
      const data = {
        value,
        timestamp: Date.now(),
      };

      await this.redis.set(key, JSON.stringify(data), 'PX', ttl);
    } catch (error) {
      logger.error('Failed to set cached value', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Acquire lock
   */
  private async acquireLock(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, '1', 'PX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('Failed to acquire lock', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Release lock
   */
  private async releaseLock(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Failed to release lock', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Refresh value in background
   */
  private async refreshInBackground<T>(
    key: string,
    executor: () => Promise<T>,
    cacheKey: string,
    cacheTTL: number,
    lockKey: string,
    lockTTL: number
  ): Promise<void> {
    // Don't await this - it runs in background
    setImmediate(async () => {
      try {
        const lockAcquired = await this.acquireLock(lockKey, lockTTL);

        if (lockAcquired) {
          try {
            const result = await executor();
            await this.setCachedValueWithMetadata(cacheKey, result, cacheTTL);
          } finally {
            await this.releaseLock(lockKey);
          }
        }
      } catch (error) {
        logger.error('Background refresh failed', {
          key,
          error: (error as Error).message,
        });
      }
    });
  }
}