/**
 * Unit Tests for Performance Edge Cases
 * **Validates: Production Checklist standards**
 * 
 * Tests connection pool exhaustion, high concurrency patterns,
 * memory usage under stress, and cache warming scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import {
  CacheWarmingManager,
  HotKeyDistributionManager,
  CachePerformanceProfiler,
  AdvancedCacheStampedePrevention,
} from '../performance';
import { logger } from '../utils/logger';

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  info: vi.fn(),
  pipeline: vi.fn(() => ({
    incrby: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn().mockResolvedValue([[null, 1]]),
  })),
};

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Performance Edge Cases Unit Tests', () => {
  let warmingManager: CacheWarmingManager;
  let hotKeyManager: HotKeyDistributionManager;
  let profiler: CachePerformanceProfiler;
  let stampedePrevention: AdvancedCacheStampedePrevention;

  beforeEach(() => {
    vi.clearAllMocks();
    warmingManager = new CacheWarmingManager(mockRedis as any);
    hotKeyManager = new HotKeyDistributionManager(mockRedis as any);
    profiler = new CachePerformanceProfiler(mockRedis as any);
    stampedePrevention = new AdvancedCacheStampedePrevention(mockRedis as any);
  });

  describe('Connection Pool Exhaustion Scenarios', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const connectionError = new Error('Connection pool exhausted');
      mockRedis.get.mockRejectedValue(connectionError);

      const dataProvider = vi.fn().mockResolvedValue('test-data');
      
      await expect(
        warmingManager.warmCache(
          {
            keys: ['key1', 'key2'],
            batchSize: 2,
            concurrency: 1,
            retryAttempts: 1,
            warmupInterval: 1000,
          },
          dataProvider
        )
      ).rejects.toThrow('Connection pool exhausted');

      expect(logger.error).toHaveBeenCalledWith(
        'Cache warming failed',
        expect.objectContaining({
          error: 'Connection pool exhausted',
        })
      );
    });

    it('should retry failed operations during cache warming', async () => {
      const dataProvider = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('test-data');

      mockRedis.set.mockResolvedValue('OK');

      await warmingManager.warmCache(
        {
          keys: ['key1'],
          batchSize: 1,
          concurrency: 1,
          retryAttempts: 2,
          warmupInterval: 1000,
        },
        dataProvider
      );

      const stats = warmingManager.getWarmingStats();
      expect(stats.warmedKeys).toBe(1);
      expect(stats.failedKeys).toBe(0);
      expect(dataProvider).toHaveBeenCalledTimes(2); // Initial failure + retry
    });

    it('should limit concurrent operations during cache warming', async () => {
      let concurrentExecutions = 0;
      let maxConcurrentExecutions = 0;

      const dataProvider = vi.fn().mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrentExecutions = Math.max(maxConcurrentExecutions, concurrentExecutions);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        concurrentExecutions--;
        return 'test-data';
      });

      mockRedis.set.mockResolvedValue('OK');

      await warmingManager.warmCache(
        {
          keys: Array.from({ length: 10 }, (_, i) => `key${i}`),
          batchSize: 10,
          concurrency: 3,
          retryAttempts: 1,
          warmupInterval: 1000,
        },
        dataProvider
      );

      expect(maxConcurrentExecutions).toBeLessThanOrEqual(3);
    });
  });

  describe('High Concurrency Load Patterns', () => {
    it('should handle rapid key access recording', async () => {
      const keyCount = 1000;
      const accessesPerKey = 50;

      // Simulate rapid key accesses
      for (let i = 0; i < keyCount; i++) {
        for (let j = 0; j < accessesPerKey; j++) {
          hotKeyManager.recordKeyAccess(`key${i}`, Math.random() * 100);
        }
      }

      // Trigger hot key analysis
      await new Promise(resolve => setTimeout(resolve, 100));

      const hotKeys = hotKeyManager.getHotKeyMetrics();
      expect(hotKeys.length).toBeGreaterThan(0);
      
      hotKeys.forEach(metric => {
        expect(metric.accessCount).toBeGreaterThan(100); // Hot key threshold
        expect(metric.isHot).toBe(true);
      });
    });

    it('should distribute hot keys under high load', async () => {
      const hotKey = 'very-hot-key';
      
      // Simulate hot key detection
      for (let i = 0; i < 150; i++) {
        hotKeyManager.recordKeyAccess(hotKey, 10);
      }

      mockRedis.get.mockResolvedValue('cached-value');
      mockRedis.set.mockResolvedValue('OK');

      // Trigger hot key analysis and distribution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify distributed keys are created
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${hotKey}:copy:`)),
        'cached-value',
        'EX',
        3600
      );
    });

    it('should handle concurrent cache operations without blocking', async () => {
      const operations = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: operations }, (_, i) => {
        profiler.recordOperation(i % 2 === 0 ? 'hit' : 'miss', Math.random() * 50);
        return Promise.resolve();
      });

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly (under 1 second for 100 operations)
      expect(duration).toBeLessThan(1000);

      const metrics = profiler.getPerformanceMetrics();
      expect(metrics.hitRate + metrics.missRate).toBeCloseTo(100, 1);
    });
  });

  describe('Memory Usage Under Stress', () => {
    it('should handle large cache warming operations', async () => {
      const largeDataProvider = vi.fn().mockImplementation(async (key: string) => {
        // Simulate large data objects
        return {
          key,
          data: 'x'.repeat(10000), // 10KB per object
          metadata: {
            timestamp: Date.now(),
            version: '1.0.0',
            tags: Array.from({ length: 100 }, (_, i) => `tag${i}`),
          },
        };
      });

      mockRedis.set.mockResolvedValue('OK');

      const keys = Array.from({ length: 100 }, (_, i) => `large-key-${i}`);

      await warmingManager.warmCache(
        {
          keys,
          batchSize: 10,
          concurrency: 5,
          retryAttempts: 1,
          warmupInterval: 1000,
        },
        largeDataProvider
      );

      const stats = warmingManager.getWarmingStats();
      expect(stats.warmedKeys).toBe(100);
      expect(stats.failedKeys).toBe(0);
    });

    it('should clean up resources after cache warming', async () => {
      const dataProvider = vi.fn().mockResolvedValue('test-data');
      mockRedis.set.mockResolvedValue('OK');

      expect(warmingManager.isWarmingInProgress()).toBe(false);

      const warmingPromise = warmingManager.warmCache(
        {
          keys: ['key1', 'key2'],
          batchSize: 1,
          concurrency: 1,
          retryAttempts: 1,
          warmupInterval: 1000,
        },
        dataProvider
      );

      expect(warmingManager.isWarmingInProgress()).toBe(true);

      await warmingPromise;

      expect(warmingManager.isWarmingInProgress()).toBe(false);
    });

    it('should handle memory-intensive hot key distribution', async () => {
      const largeValue = JSON.stringify({
        data: 'x'.repeat(50000), // 50KB
        metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item${i}` })),
      });

      mockRedis.get.mockResolvedValue(largeValue);
      mockRedis.set.mockResolvedValue('OK');

      // Simulate hot key with large value
      const hotKey = 'large-hot-key';
      for (let i = 0; i < 150; i++) {
        hotKeyManager.recordKeyAccess(hotKey, 20);
      }

      // Trigger distribution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should handle large values without errors
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${hotKey}:copy:`)),
        largeValue,
        'EX',
        3600
      );
    });
  });

  describe('Garbage Collection Performance', () => {
    it('should handle frequent object creation and cleanup', async () => {
      const iterations = 1000;
      const startMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        // Create temporary objects that should be garbage collected
        const tempData = {
          id: i,
          data: Array.from({ length: 100 }, (_, j) => `item${j}`),
          timestamp: Date.now(),
        };

        profiler.recordOperation('hit', Math.random() * 100);
        
        // Force some operations to complete
        if (i % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should clean up expired hot key metrics', async () => {
      const oldKey = 'old-key';
      const newKey = 'new-key';

      // Record old access
      hotKeyManager.recordKeyAccess(oldKey, 10);
      
      // Mock old timestamp
      const hotKeys = (hotKeyManager as any).hotKeys;
      const oldMetric = hotKeys.get(oldKey);
      if (oldMetric) {
        oldMetric.lastAccessed = new Date(Date.now() - 120000); // 2 minutes ago
        hotKeys.set(oldKey, oldMetric);
      }

      // Record new access
      hotKeyManager.recordKeyAccess(newKey, 10);

      // Trigger cleanup (simulate interval)
      await new Promise(resolve => setTimeout(resolve, 100));

      const oldMetricAfter = hotKeys.get(oldKey);
      const newMetricAfter = hotKeys.get(newKey);

      expect(oldMetricAfter?.accessCount).toBe(0);
      expect(newMetricAfter?.accessCount).toBe(1);
    });
  });

  describe('Cache Warming and Invalidation', () => {
    it('should handle cache warming failures gracefully', async () => {
      const failingDataProvider = vi.fn().mockRejectedValue(new Error('Data source unavailable'));

      await expect(
        warmingManager.warmCache(
          {
            keys: ['key1', 'key2', 'key3'],
            batchSize: 2,
            concurrency: 1,
            retryAttempts: 2,
            warmupInterval: 1000,
          },
          failingDataProvider
        )
      ).rejects.toThrow('Data source unavailable');

      const stats = warmingManager.getWarmingStats();
      expect(stats.failedKeys).toBe(3);
      expect(stats.warmedKeys).toBe(0);
    });

    it('should handle partial cache warming failures', async () => {
      const partiallyFailingDataProvider = vi.fn()
        .mockResolvedValueOnce('data1')
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('data3');

      mockRedis.set.mockResolvedValue('OK');

      await warmingManager.warmCache(
        {
          keys: ['key1', 'key2', 'key3'],
          batchSize: 3,
          concurrency: 1,
          retryAttempts: 0, // No retries
          warmupInterval: 1000,
        },
        partiallyFailingDataProvider
      );

      const stats = warmingManager.getWarmingStats();
      expect(stats.warmedKeys).toBe(2);
      expect(stats.failedKeys).toBe(1);
    });

    it('should handle Redis failures during cache warming', async () => {
      const dataProvider = vi.fn().mockResolvedValue('test-data');
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      await warmingManager.warmCache(
        {
          keys: ['key1'],
          batchSize: 1,
          concurrency: 1,
          retryAttempts: 1,
          warmupInterval: 1000,
        },
        dataProvider
      );

      const stats = warmingManager.getWarmingStats();
      expect(stats.failedKeys).toBe(1);
      expect(stats.warmedKeys).toBe(0);
    });
  });

  describe('Clock Skew Scenarios', () => {
    it('should handle probabilistic early expiration correctly', async () => {
      const key = 'test-key';
      const cacheTTL = 300000; // 5 minutes
      
      // Mock stale cache that should trigger recomputation
      mockRedis.get.mockResolvedValue(JSON.stringify({
        value: 'stale-value',
        timestamp: Date.now() - cacheTTL + 1000, // Almost expired
      }));

      mockRedis.set.mockResolvedValue('OK');

      let executionCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        executionCount++;
        return 'fresh-value';
      });

      const result = await stampedePrevention.executeWithStampedePrevention(
        key,
        executor,
        {
          cacheTTL,
          probabilisticEarlyExpiration: true,
          beta: 1.0,
        }
      );

      // Should either return stale value or fresh value depending on probability
      expect(['stale-value', 'fresh-value']).toContain(result);
    });

    it('should handle clock synchronization failures', async () => {
      // Mock NTP failure
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn().mockImplementation((callback, delay) => {
        if (delay === 5000) {
          // Simulate NTP timeout
          callback();
          return {} as any;
        }
        return originalSetTimeout(callback, delay);
      });

      // Clock handler should handle NTP failures gracefully
      const clockHandler = new (require('../concurrency').ClockSkewHandler)();
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const clockInfo = clockHandler.getClockInfo();
      expect(clockInfo.offset).toBe(0); // Should default to 0 on failure

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Performance Profiler Edge Cases', () => {
    it('should handle rapid metric collection', async () => {
      const operations = 10000;
      const startTime = Date.now();

      for (let i = 0; i < operations; i++) {
        profiler.recordOperation(i % 3 === 0 ? 'hit' : 'miss', Math.random() * 200);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 10k operations quickly
      expect(duration).toBeLessThan(1000);

      const metrics = profiler.getPerformanceMetrics();
      expect(metrics.hitRate + metrics.missRate).toBeCloseTo(100, 1);
      expect(metrics.throughput).toBeGreaterThan(0);
    });

    it('should calculate percentiles correctly with sparse data', async () => {
      // Record only a few operations
      profiler.recordOperation('hit', 10);
      profiler.recordOperation('hit', 50);
      profiler.recordOperation('hit', 100);

      const percentiles = profiler.getResponseTimePercentiles();
      
      expect(percentiles.p50).toBeGreaterThanOrEqual(0);
      expect(percentiles.p95).toBeGreaterThanOrEqual(percentiles.p50);
      expect(percentiles.p99).toBeGreaterThanOrEqual(percentiles.p95);
    });

    it('should handle Redis info parsing failures', async () => {
      mockRedis.info.mockRejectedValue(new Error('Redis info failed'));

      // Should not throw error
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to collect Redis metrics',
        expect.objectContaining({
          error: 'Redis info failed',
        })
      );
    });
  });
});