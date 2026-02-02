/**
 * Property Tests for Error Handling and Recovery
 * **Property 25: Error Handling and Recovery**
 * **Validates: Production Checklist - Distributed System**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  CircuitBreaker,
  CircuitBreakerState,
  RetryManager,
  HealthCheckManager,
  GracefulDegradationManager,
  RetryStormPrevention,
} from '../utils/circuit-breaker';
import { logger } from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch for health checks
global.fetch = vi.fn();

describe('Property 25: Error Handling and Recovery', () => {
  let circuitBreaker: CircuitBreaker;
  let retryManager: RetryManager;
  let healthCheckManager: HealthCheckManager;
  let degradationManager: GracefulDegradationManager;
  let stormPrevention: RetryStormPrevention;

  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreaker = new CircuitBreaker('test-service');
    retryManager = new RetryManager();
    healthCheckManager = new HealthCheckManager();
    degradationManager = new GracefulDegradationManager();
    stormPrevention = new RetryStormPrevention(5);
  });

  afterEach(() => {
    healthCheckManager.stopAll();
  });

  describe('Circuit Breaker Patterns', () => {
    it('should transition states correctly based on failure patterns', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 10, maxLength: 50 }),
          fc.integer({ min: 1, max: 10 }),
          async (results, failureThreshold) => {
            const cb = new CircuitBreaker('test', { failureThreshold, minimumThroughput: 5 });
            let consecutiveFailures = 0;
            let maxConsecutiveFailures = 0;

            for (const shouldSucceed of results) {
              try {
                await cb.execute(async () => {
                  if (shouldSucceed) {
                    consecutiveFailures = 0;
                    return 'success';
                  } else {
                    consecutiveFailures++;
                    maxConsecutiveFailures = Math.max(maxConsecutiveFailures, consecutiveFailures);
                    throw new Error('Service failure');
                  }
                });
              } catch (error) {
                // Expected for failures and circuit breaker trips
              }
            }

            const status = cb.getStatus();
            
            // If we had enough consecutive failures, circuit should be open
            if (maxConsecutiveFailures >= failureThreshold && results.length >= 5) {
              expect([CircuitBreakerState.OPEN, CircuitBreakerState.HALF_OPEN]).toContain(status.state);
            }
            
            // Failure count should not exceed threshold + buffer in closed state
            if (status.state === CircuitBreakerState.CLOSED) {
              expect(status.failureCount).toBeLessThanOrEqual(failureThreshold);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should recover from OPEN state after timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 1000 }),
          async (recoveryTimeout) => {
            const cb = new CircuitBreaker('test', { 
              failureThreshold: 2, 
              recoveryTimeout,
              minimumThroughput: 1 
            });

            // Trip the circuit breaker
            for (let i = 0; i < 3; i++) {
              try {
                await cb.execute(async () => {
                  throw new Error('Failure');
                });
              } catch (error) {
                // Expected
              }
            }

            expect(cb.getStatus().state).toBe(CircuitBreakerState.OPEN);

            // Wait for recovery timeout
            await new Promise(resolve => setTimeout(resolve, recoveryTimeout + 50));

            // Next call should transition to HALF_OPEN
            try {
              await cb.execute(async () => 'success');
            } catch (error) {
              // May fail if still in OPEN state
            }

            // Should be in HALF_OPEN or CLOSED state
            expect([CircuitBreakerState.HALF_OPEN, CircuitBreakerState.CLOSED])
              .toContain(cb.getStatus().state);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should limit calls in HALF_OPEN state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (halfOpenMaxCalls) => {
            const cb = new CircuitBreaker('test', { 
              failureThreshold: 1, 
              recoveryTimeout: 100,
              halfOpenMaxCalls,
              minimumThroughput: 1 
            });

            // Trip circuit breaker
            try {
              await cb.execute(async () => {
                throw new Error('Failure');
              });
            } catch (error) {
              // Expected
            }

            // Wait for recovery
            await new Promise(resolve => setTimeout(resolve, 150));

            // Make calls in HALF_OPEN state
            let successfulCalls = 0;
            let rejectedCalls = 0;

            for (let i = 0; i < halfOpenMaxCalls + 2; i++) {
              try {
                await cb.execute(async () => 'success');
                successfulCalls++;
              } catch (error) {
                if ((error as Error).message.includes('HALF_OPEN limit exceeded')) {
                  rejectedCalls++;
                }
              }
            }

            // Should not exceed half-open limit
            expect(successfulCalls).toBeLessThanOrEqual(halfOpenMaxCalls);
            expect(rejectedCalls).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should retry retryable errors with proper backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 100, max: 1000 }),
          fc.constantFrom('ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'),
          async (maxAttempts, baseDelay, errorCode) => {
            const rm = new RetryManager({ maxAttempts, baseDelay, retryableErrors: [errorCode] });
            let attemptCount = 0;
            const attemptTimes: number[] = [];

            try {
              await rm.executeWithRetry(async () => {
                attemptCount++;
                attemptTimes.push(Date.now());
                
                if (attemptCount < maxAttempts) {
                  const error = new Error(`Network error: ${errorCode}`);
                  (error as any).code = errorCode;
                  throw error;
                }
                
                return 'success';
              });
            } catch (error) {
              // May fail if all retries exhausted
            }

            expect(attemptCount).toBeLessThanOrEqual(maxAttempts);

            // Check exponential backoff timing
            if (attemptTimes.length > 1) {
              for (let i = 1; i < attemptTimes.length; i++) {
                const delay = attemptTimes[i] - attemptTimes[i - 1];
                const expectedMinDelay = baseDelay * Math.pow(2, i - 1) * 0.9; // Account for jitter
                expect(delay).toBeGreaterThanOrEqual(expectedMinDelay);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not retry non-retryable errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 2, max: 5 }),
          async (errorMessage, maxAttempts) => {
            fc.pre(!['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].some(code => 
              errorMessage.includes(code)
            ));

            const rm = new RetryManager({ maxAttempts });
            let attemptCount = 0;

            try {
              await rm.executeWithRetry(async () => {
                attemptCount++;
                throw new Error(errorMessage);
              });
            } catch (error) {
              expect((error as Error).message).toBe(errorMessage);
            }

            // Should only attempt once for non-retryable errors
            expect(attemptCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect maximum delay cap', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 500 }),
          fc.integer({ min: 1000, max: 5000 }),
          fc.integer({ min: 3, max: 8 }),
          async (baseDelay, maxDelay, maxAttempts) => {
            const rm = new RetryManager({ baseDelay, maxDelay, maxAttempts });
            const attemptTimes: number[] = [];

            try {
              await rm.executeWithRetry(async () => {
                attemptTimes.push(Date.now());
                throw new Error('ECONNRESET');
              });
            } catch (error) {
              // Expected to fail after all retries
            }

            // Check that delays don't exceed maxDelay
            if (attemptTimes.length > 1) {
              for (let i = 1; i < attemptTimes.length; i++) {
                const delay = attemptTimes[i] - attemptTimes[i - 1];
                expect(delay).toBeLessThanOrEqual(maxDelay * 1.2); // Account for jitter
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Graceful Degradation', () => {
    it('should fallback to secondary service when primary fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.boolean(),
          async (primaryResult, fallbackResult, primaryShouldFail) => {
            const primaryService = vi.fn().mockImplementation(async () => {
              if (primaryShouldFail) {
                throw new Error('Primary service failed');
              }
              return primaryResult;
            });

            const fallbackService = vi.fn().mockResolvedValue(fallbackResult);

            degradationManager.registerService(
              'test-service',
              primaryService,
              fallbackService,
              { failureThreshold: 1, minimumThroughput: 1 }
            );

            const result = await degradationManager.executeWithDegradation(
              'test-service',
              primaryService
            );

            if (primaryShouldFail) {
              expect(result).toBe(fallbackResult);
              expect(fallbackService).toHaveBeenCalled();
            } else {
              expect(result).toBe(primaryResult);
              expect(fallbackService).not.toHaveBeenCalled();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track service health across multiple calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 5, maxLength: 20 }),
          async (callResults) => {
            let callIndex = 0;
            const primaryService = vi.fn().mockImplementation(async () => {
              const shouldSucceed = callResults[callIndex % callResults.length];
              callIndex++;
              
              if (shouldSucceed) {
                return 'success';
              } else {
                throw new Error('Service failure');
              }
            });

            const fallbackService = vi.fn().mockResolvedValue('fallback');

            degradationManager.registerService(
              'test-service',
              primaryService,
              fallbackService,
              { failureThreshold: 2, minimumThroughput: 3 }
            );

            const results: string[] = [];
            
            for (let i = 0; i < callResults.length; i++) {
              try {
                const result = await degradationManager.executeWithDegradation(
                  'test-service',
                  primaryService
                );
                results.push(result);
              } catch (error) {
                // Some calls may fail
              }
            }

            const status = degradationManager.getServiceStatus('test-service');
            expect(status).toBeDefined();
            expect(status.name).toBe('test-service');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Health Check Reliability', () => {
    it('should transition health status based on consecutive results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 10, maxLength: 30 }),
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 2, max: 5 }),
          async (healthResults, healthyThreshold, unhealthyThreshold) => {
            let resultIndex = 0;
            
            (global.fetch as any).mockImplementation(async () => {
              const isHealthy = healthResults[resultIndex % healthResults.length];
              resultIndex++;
              
              return {
                ok: isHealthy,
                status: isHealthy ? 200 : 500,
              };
            });

            const healthCheckPromise = new Promise<any>((resolve) => {
              let callbackCount = 0;
              
              healthCheckManager.registerCheck('test-service', {
                endpoint: 'http://localhost:3000/health',
                timeout: 1000,
                interval: 100,
                healthyThreshold,
                unhealthyThreshold,
              });

              // Wait for several health check cycles
              setTimeout(() => {
                const result = healthCheckManager.getHealthCheck('test-service');
                resolve(result);
              }, (healthResults.length + 5) * 100);
            });

            const finalResult = await healthCheckPromise;
            
            expect(finalResult).toBeDefined();
            expect(['healthy', 'unhealthy']).toContain(finalResult.status);
            expect(finalResult.consecutiveSuccesses).toBeGreaterThanOrEqual(0);
            expect(finalResult.consecutiveFailures).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should provide overall system health based on individual checks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
          async (serviceHealthStates) => {
            // Mock different health states for different services
            (global.fetch as any).mockImplementation(async (url: string) => {
              const serviceIndex = parseInt(url.split('service')[1]) || 0;
              const isHealthy = serviceHealthStates[serviceIndex % serviceHealthStates.length];
              
              return {
                ok: isHealthy,
                status: isHealthy ? 200 : 500,
              };
            });

            // Register multiple health checks
            for (let i = 0; i < serviceHealthStates.length; i++) {
              healthCheckManager.registerCheck(`service${i}`, {
                endpoint: `http://localhost:3000/service${i}/health`,
                timeout: 1000,
                interval: 100,
                healthyThreshold: 1,
                unhealthyThreshold: 1,
              });
            }

            // Wait for health checks to run
            await new Promise(resolve => setTimeout(resolve, 300));

            const overallHealth = healthCheckManager.getOverallHealth();
            
            expect(overallHealth.summary.total).toBe(serviceHealthStates.length);
            expect(overallHealth.summary.healthy + overallHealth.summary.unhealthy)
              .toBe(serviceHealthStates.length);
            
            const healthyCount = serviceHealthStates.filter(h => h).length;
            const unhealthyCount = serviceHealthStates.length - healthyCount;
            
            if (unhealthyCount === 0) {
              expect(overallHealth.status).toBe('healthy');
            } else if (healthyCount > unhealthyCount) {
              expect(['healthy', 'degraded']).toContain(overallHealth.status);
            } else {
              expect(['degraded', 'unhealthy']).toContain(overallHealth.status);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Retry Storm Prevention', () => {
    it('should limit concurrent retries for the same operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (concurrentRequests, maxConcurrentRetries) => {
            const sp = new RetryStormPrevention(maxConcurrentRetries);
            let activeOperations = 0;
            let maxActiveOperations = 0;
            let stormDetected = false;

            const operation = async () => {
              activeOperations++;
              maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
              
              // Simulate some work
              await new Promise(resolve => setTimeout(resolve, 50));
              
              activeOperations--;
              return 'success';
            };

            const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
              try {
                return await sp.executeWithStormPrevention(`operation-key`, operation);
              } catch (error) {
                if ((error as Error).message.includes('Retry storm detected')) {
                  stormDetected = true;
                }
                throw error;
              }
            });

            const results = await Promise.allSettled(promises);
            
            if (concurrentRequests > maxConcurrentRetries) {
              expect(stormDetected).toBe(true);
              
              const rejectedCount = results.filter(r => r.status === 'rejected').length;
              expect(rejectedCount).toBeGreaterThan(0);
            }
            
            // Should never exceed the limit
            expect(maxActiveOperations).toBeLessThanOrEqual(maxConcurrentRetries);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should track retry counts per operation key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
          async (operationKeys) => {
            const sp = new RetryStormPrevention(3);
            const operationCounts = new Map<string, number>();

            const promises = operationKeys.map(async (key) => {
              operationCounts.set(key, (operationCounts.get(key) || 0) + 1);
              
              try {
                return await sp.executeWithStormPrevention(key, async () => {
                  await new Promise(resolve => setTimeout(resolve, 10));
                  return `result-${key}`;
                });
              } catch (error) {
                return `error-${key}`;
              }
            });

            await Promise.allSettled(promises);

            const stats = sp.getRetryStats();
            
            // Each unique key should be tracked separately
            for (const key of new Set(operationKeys)) {
              if (operationCounts.get(key)! <= 3) {
                // Should not be in stats if under limit
                expect(stats[key]).toBeUndefined();
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Chaos Engineering Scenarios', () => {
    it('should handle random service failures gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.float({ min: 0, max: 1 }), { minLength: 20, maxLength: 50 }),
          fc.float({ min: 0.1, max: 0.5 }),
          async (randomValues, failureRate) => {
            let successCount = 0;
            let fallbackCount = 0;
            let totalFailures = 0;

            const chaosService = async (randomValue: number) => {
              if (randomValue < failureRate) {
                totalFailures++;
                throw new Error('Chaos failure');
              }
              successCount++;
              return 'primary-success';
            };

            const fallbackService = async () => {
              fallbackCount++;
              return 'fallback-success';
            };

            degradationManager.registerService(
              'chaos-service',
              chaosService,
              fallbackService,
              { failureThreshold: 3, minimumThroughput: 5 }
            );

            const results: string[] = [];

            for (const randomValue of randomValues) {
              try {
                const result = await degradationManager.executeWithDegradation(
                  'chaos-service',
                  () => chaosService(randomValue)
                );
                results.push(result);
              } catch (error) {
                // Some operations may still fail
              }
            }

            // System should remain operational despite failures
            expect(results.length).toBeGreaterThan(0);
            
            // Should use fallback when primary fails frequently
            if (totalFailures > 5) {
              expect(fallbackCount).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should recover from cascading failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }),
          fc.integer({ min: 2, max: 8 }),
          async (totalOperations, cascadeLength) => {
            let operationIndex = 0;
            const results: string[] = [];

            const cascadingService = async () => {
              operationIndex++;
              
              // Simulate cascading failure
              if (operationIndex <= cascadeLength) {
                throw new Error(`Cascading failure ${operationIndex}`);
              }
              
              return `success-${operationIndex}`;
            };

            const fallbackService = async () => {
              return `fallback-${operationIndex}`;
            };

            degradationManager.registerService(
              'cascade-service',
              cascadingService,
              fallbackService,
              { failureThreshold: 2, minimumThroughput: 1 }
            );

            for (let i = 0; i < totalOperations; i++) {
              try {
                const result = await degradationManager.executeWithDegradation(
                  'cascade-service',
                  cascadingService
                );
                results.push(result);
              } catch (error) {
                // Some operations may fail
              }
            }

            // Should eventually recover and produce results
            expect(results.length).toBeGreaterThan(0);
            
            // Should have some fallback results during cascade
            const fallbackResults = results.filter(r => r.includes('fallback'));
            if (cascadeLength > 2) {
              expect(fallbackResults.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});