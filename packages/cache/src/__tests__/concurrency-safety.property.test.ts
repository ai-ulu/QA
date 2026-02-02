/**
 * Property Tests for Concurrency Safety
 * **Property 23: Concurrency and Race Condition Prevention**
 * **Validates: Production Checklist - Concurrency & Parallelism**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import Redis from 'ioredis';
import {
  IdempotencyManager,
  DistributedLockManager,
  AtomicOperationsManager,
  ThunderingHerdPrevention,
  ClockSkewHandler,
} from '../concurrency';
import { logger } from '../utils/logger';

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
  pipeline: vi.fn(() => ({
    incrby: vi.fn(),
    expire: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    hset: vi.fn(),
    exec: vi.fn().mockResolvedValue([[null, 1]]),
  })),
  incrby: vi.fn(),
  expire: vi.fn(),
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

describe('Property 23: Concurrency and Race Condition Prevention', () => {
  let idempotencyManager: IdempotencyManager;
  let lockManager: DistributedLockManager;
  let atomicManager: AtomicOperationsManager;
  let herdPrevention: ThunderingHerdPrevention;
  let clockHandler: ClockSkewHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyManager = new IdempotencyManager(mockRedis as any);
    lockManager = new DistributedLockManager(mockRedis as any);
    atomicManager = new AtomicOperationsManager(mockRedis as any);
    herdPrevention = new ThunderingHerdPrevention(mockRedis as any);
    clockHandler = new ClockSkewHandler();
  });

  describe('Idempotency Key Correctness', () => {
    it('should generate consistent keys for identical operations', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            amount: fc.integer({ min: 1, max: 1000 }),
            currency: fc.constantFrom('USD', 'EUR', 'GBP'),
          }),
          (operation, params) => {
            const key1 = idempotencyManager.generateKey(operation, params);
            const key2 = idempotencyManager.generateKey(operation, params);
            
            expect(key1).toBe(key2);
            expect(key1).toMatch(/^idempotency:/);
            expect(key1).toMatch(/:[a-f0-9]{64}$/); // SHA-256 hash
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate different keys for different operations', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            amount: fc.integer({ min: 1, max: 1000 }),
          }),
          (operation1, operation2, params) => {
            fc.pre(operation1 !== operation2);
            
            const key1 = idempotencyManager.generateKey(operation1, params);
            const key2 = idempotencyManager.generateKey(operation2, params);
            
            expect(key1).not.toBe(key2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle idempotent operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            amount: fc.integer({ min: 1, max: 1000 }),
          }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1000, max: 10000 }),
          async (operation, params, expectedResult, ttl) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              return expectedResult;
            });

            // Mock Redis responses for idempotency flow
            mockRedis.get
              .mockResolvedValueOnce(null) // First check - no existing operation
              .mockResolvedValueOnce(JSON.stringify({
                key: 'test-key',
                expiresAt: new Date(Date.now() + ttl),
                result: expectedResult,
                status: 'completed',
              })); // Second check - operation completed

            mockRedis.set
              .mockResolvedValueOnce('OK') // Start operation
              .mockResolvedValueOnce('OK'); // Complete operation

            // First execution
            const result1 = await idempotencyManager.executeIdempotent(
              operation,
              params,
              executor,
              ttl
            );

            // Second execution (should return cached result)
            const result2 = await idempotencyManager.executeIdempotent(
              operation,
              params,
              executor,
              ttl
            );

            expect(result1).toBe(expectedResult);
            expect(result2).toBe(expectedResult);
            expect(executionCount).toBe(1); // Should only execute once
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Distributed Lock Safety', () => {
    it('should acquire and release locks correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1000, max: 30000 }),
          async (resource, ttl) => {
            // Mock successful lock acquisition
            mockRedis.set.mockResolvedValueOnce('OK');
            mockRedis.eval.mockResolvedValueOnce(1); // Successful release

            const identifier = await lockManager.acquireLock(resource, { ttl });
            
            expect(identifier).toBeTruthy();
            expect(mockRedis.set).toHaveBeenCalledWith(
              `lock:${resource}`,
              identifier,
              'PX',
              ttl,
              'NX'
            );

            const released = await lockManager.releaseLock(resource, identifier!);
            
            expect(released).toBe(true);
            expect(mockRedis.eval).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle lock contention correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 5 }),
          async (resource, retryCount) => {
            // Mock lock acquisition failure
            mockRedis.set.mockResolvedValue(null);

            const identifier = await lockManager.acquireLock(resource, {
              retryCount,
              retryDelay: 10, // Short delay for testing
            });
            
            expect(identifier).toBeNull();
            expect(mockRedis.set).toHaveBeenCalledTimes(retryCount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should execute operations with lock protection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (resource, expectedResult) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              return expectedResult;
            });

            // Mock successful lock acquisition and release
            mockRedis.set.mockResolvedValueOnce('OK');
            mockRedis.eval.mockResolvedValueOnce(1);

            const result = await lockManager.executeWithLock(resource, executor);
            
            expect(result).toBe(expectedResult);
            expect(executionCount).toBe(1);
            expect(executor).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Atomic Operations Consistency', () => {
    it('should perform atomic increments correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 100 }),
          fc.option(fc.integer({ min: 1000, max: 10000 })),
          async (key, increment, ttl) => {
            const expectedValue = increment * 2; // Simulate current value
            mockRedis.pipeline().exec.mockResolvedValueOnce([[null, expectedValue]]);

            const result = await atomicManager.atomicIncrement(key, increment, ttl);
            
            expect(result).toBe(expectedValue);
            expect(mockRedis.pipeline).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should perform atomic list operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 10 }),
          fc.option(fc.integer({ min: 5, max: 50 })),
          async (key, values, maxLength) => {
            const expectedLength = Math.min(values.length, maxLength || values.length);
            mockRedis.pipeline().exec.mockResolvedValueOnce([[null, expectedLength]]);

            const result = await atomicManager.atomicListPush(key, values, maxLength);
            
            expect(result).toBe(expectedLength);
            expect(mockRedis.pipeline).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should perform compare-and-swap operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.boolean(),
          async (key, expectedValue, newValue, shouldSucceed) => {
            mockRedis.eval.mockResolvedValueOnce(shouldSucceed ? 1 : 0);

            const result = await atomicManager.compareAndSwap(key, expectedValue, newValue);
            
            expect(result).toBe(shouldSucceed);
            expect(mockRedis.eval).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Thundering Herd Prevention', () => {
    it('should prevent thundering herd with cache hits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 60000, max: 600000 }),
          async (key, cachedValue, cacheTTL) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              return 'fresh-value';
            });

            // Mock cache hit
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({
              value: cachedValue,
              timestamp: Date.now() - 1000, // 1 second old
            }));

            const result = await herdPrevention.executeWithHerdPrevention(
              key,
              executor,
              { cacheTTL }
            );
            
            expect(result).toBe(cachedValue);
            expect(executionCount).toBe(0); // Should not execute
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle cache misses with lock acquisition', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (key, freshValue) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              return freshValue;
            });

            // Mock cache miss and successful lock acquisition
            mockRedis.get.mockResolvedValueOnce(null); // Cache miss
            mockRedis.set
              .mockResolvedValueOnce('OK') // Lock acquisition
              .mockResolvedValueOnce('OK'); // Cache set

            const result = await herdPrevention.executeWithHerdPrevention(key, executor);
            
            expect(result).toBe(freshValue);
            expect(executionCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle stale-while-revalidate correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 60000, max: 300000 }),
          async (key, staleValue, cacheTTL) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              return 'fresh-value';
            });

            // Mock stale cache hit
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({
              value: staleValue,
              timestamp: Date.now() - cacheTTL - 1000, // Stale
            }));

            const result = await herdPrevention.executeWithHerdPrevention(
              key,
              executor,
              { cacheTTL, staleWhileRevalidate: true }
            );
            
            expect(result).toBe(staleValue); // Should return stale value immediately
            // Background refresh should be triggered but not awaited
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Clock Skew Handling', () => {
    it('should provide adjusted timestamps', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: -5000, max: 5000 }),
          (offset) => {
            // Mock clock offset
            (clockHandler as any).clockOffset = offset;
            
            const adjustedTime = clockHandler.now();
            const expectedTime = Date.now() + offset;
            
            // Allow for small timing differences
            expect(Math.abs(adjustedTime - expectedTime)).toBeLessThan(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report healthy clock status within acceptable skew', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),
          (offset) => {
            // Mock healthy clock state
            (clockHandler as any).clockOffset = offset;
            (clockHandler as any).lastSync = Date.now() - 60000; // 1 minute ago
            
            const clockInfo = clockHandler.getClockInfo();
            
            expect(clockInfo.offset).toBe(offset);
            expect(clockInfo.isHealthy).toBe(Math.abs(offset) < 5000);
            expect(clockInfo.syncAge).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect unhealthy clock when skew is significant', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 10000, max: 60000 }),
          (offset) => {
            // Mock significant clock skew
            (clockHandler as any).clockOffset = offset;
            (clockHandler as any).lastSync = Date.now() - 60000;
            
            const clockInfo = clockHandler.getClockInfo();
            
            expect(clockInfo.isHealthy).toBe(false);
            expect(Math.abs(clockInfo.offset)).toBeGreaterThanOrEqual(5000);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent idempotent operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            amount: fc.integer({ min: 1, max: 1000 }),
          }),
          fc.integer({ min: 2, max: 10 }),
          async (operation, params, concurrency) => {
            let executionCount = 0;
            const executor = vi.fn().mockImplementation(async () => {
              executionCount++;
              await new Promise(resolve => setTimeout(resolve, 10));
              return 'result';
            });

            // Mock Redis responses for concurrent operations
            mockRedis.get.mockResolvedValue(null);
            mockRedis.set
              .mockResolvedValueOnce('OK') // First operation succeeds
              .mockResolvedValue(null); // Subsequent operations fail to acquire

            // Execute concurrent operations
            const promises = Array(concurrency).fill(0).map(() =>
              idempotencyManager.executeIdempotent(operation, params, executor)
            );

            const results = await Promise.all(promises);
            
            // All should return the same result
            results.forEach(result => expect(result).toBe('result'));
            
            // But executor should only be called once (by the first operation)
            expect(executionCount).toBe(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle concurrent lock acquisitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 2, max: 5 }),
          async (resource, concurrency) => {
            // Mock that only first lock acquisition succeeds
            mockRedis.set
              .mockResolvedValueOnce('OK')
              .mockResolvedValue(null);

            const promises = Array(concurrency).fill(0).map(() =>
              lockManager.acquireLock(resource, { retryCount: 1, retryDelay: 10 })
            );

            const identifiers = await Promise.all(promises);
            
            // Only one should succeed
            const successfulLocks = identifiers.filter(id => id !== null);
            expect(successfulLocks).toHaveLength(1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});