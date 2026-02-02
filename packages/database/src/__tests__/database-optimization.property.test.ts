/**
 * Property Tests for Database Optimization
 * **Property 22: Database Query Optimization**
 * **Validates: Production Checklist - Database & ORM**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { 
  DatabasePerformanceMonitor, 
  CursorPagination, 
  DataIntegrityChecker,
  TransactionManager 
} from '../performance';
import { logger } from '../utils/logger';

// Mock PrismaClient
const mockPrismaClient = {
  $use: vi.fn(),
  $transaction: vi.fn(),
  project: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Property 22: Database Query Optimization', () => {
  let performanceMonitor: DatabasePerformanceMonitor;
  let transactionManager: TransactionManager;
  let integrityChecker: DataIntegrityChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceMonitor = new DatabasePerformanceMonitor(mockPrismaClient as any);
    transactionManager = new TransactionManager(mockPrismaClient as any);
    integrityChecker = new DataIntegrityChecker(mockPrismaClient as any);
  });

  afterEach(() => {
    performanceMonitor.resetMetrics();
  });

  describe('N+1 Query Prevention', () => {
    it('should detect N+1 queries when threshold is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 15, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          async (queries, model) => {
            // Simulate multiple queries for the same model
            const middleware = vi.mocked(mockPrismaClient.$use).mock.calls[0]?.[0];
            
            if (middleware) {
              for (const query of queries) {
                const params = { model, action: 'findMany' };
                const next = vi.fn().mockResolvedValue({ id: query });
                
                await middleware(params, next);
              }
            }

            const metrics = performanceMonitor.getQueryMetrics();
            const modelMetrics = metrics.get(`${model}.findMany`);

            if (queries.length > 10) {
              expect(modelMetrics?.nPlusOneDetected).toBe(true);
              expect(logger.error).toHaveBeenCalledWith(
                'Potential N+1 query detected',
                expect.objectContaining({
                  model,
                  action: 'findMany',
                  queryCount: queries.length,
                })
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not flag normal query patterns as N+1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          async (queries, model) => {
            const middleware = vi.mocked(mockPrismaClient.$use).mock.calls[0]?.[0];
            
            if (middleware) {
              for (const query of queries) {
                const params = { model, action: 'findMany' };
                const next = vi.fn().mockResolvedValue({ id: query });
                
                await middleware(params, next);
              }
            }

            const metrics = performanceMonitor.getQueryMetrics();
            const modelMetrics = metrics.get(`${model}.findMany`);

            expect(modelMetrics?.nPlusOneDetected).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Connection Pool Integrity', () => {
    it('should maintain connection pool metrics without leaks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (operationCount) => {
            // Simulate multiple operations
            for (let i = 0; i < operationCount; i++) {
              const middleware = vi.mocked(mockPrismaClient.$use).mock.calls[0]?.[0];
              
              if (middleware) {
                const params = { model: 'test', action: 'findMany' };
                const next = vi.fn().mockResolvedValue({ id: i });
                
                await middleware(params, next);
              }
            }

            const connectionMetrics = performanceMonitor.getConnectionMetrics();
            
            // Connection pool should be within bounds
            expect(connectionMetrics.totalConnections).toBeLessThanOrEqual(connectionMetrics.maxConnections);
            expect(connectionMetrics.activeConnections).toBeGreaterThanOrEqual(0);
            expect(connectionMetrics.idleConnections).toBeGreaterThanOrEqual(0);
            
            // Total should equal active + idle
            expect(connectionMetrics.totalConnections).toBe(
              connectionMetrics.activeConnections + connectionMetrics.idleConnections
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect connection leaks when usage is high', async () => {
      // Mock high connection usage
      vi.spyOn(Math, 'random').mockReturnValue(0.9); // Force high usage
      
      // Trigger connection metrics update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const connectionMetrics = performanceMonitor.getConnectionMetrics();
      
      if (connectionMetrics.activeConnections > connectionMetrics.maxConnections * 0.8) {
        expect(logger.warn).toHaveBeenCalledWith(
          'High connection usage detected',
          expect.objectContaining({
            activeConnections: expect.any(Number),
            maxConnections: expect.any(Number),
            utilization: expect.any(Number),
          })
        );
      }
      
      vi.restoreAllMocks();
    });
  });

  describe('Cursor-based Pagination Consistency', () => {
    it('should create consistent pagination queries', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1, max: 100 }),
          fc.constantFrom('asc', 'desc'),
          (cursor, take, orderDirection) => {
            const query = CursorPagination.createCursorQuery({
              cursor,
              take,
              orderBy: 'id',
              orderDirection,
            });

            expect(query.take).toBe(take);
            expect(query.orderBy.id).toBe(orderDirection);
            expect(query.cursor?.id).toBe(cursor);
            expect(query.skip).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle pagination without cursor', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.constantFrom('asc', 'desc'),
          (take, orderDirection) => {
            const query = CursorPagination.createCursorQuery({
              take,
              orderBy: 'id',
              orderDirection,
            });

            expect(query.take).toBe(take);
            expect(query.orderBy.id).toBe(orderDirection);
            expect(query.cursor).toBeUndefined();
            expect(query.skip).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract cursor from results consistently', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (results) => {
            const cursor = CursorPagination.extractCursor(results, 'id');
            
            if (results.length > 0) {
              expect(cursor).toBe(results[results.length - 1].id);
            } else {
              expect(cursor).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create consistent pagination responses', async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 0, maxLength: 20 }),
          fc.option(fc.string({ minLength: 1, maxLength: 20 })),
          fc.boolean(),
          (data, cursor, hasMore) => {
            const response = CursorPagination.createPaginationResponse(data, cursor, hasMore);
            
            expect(response.data).toEqual(data);
            expect(response.pagination.cursor).toBe(cursor);
            expect(response.pagination.hasMore).toBe(hasMore);
            expect(response.pagination.count).toBe(data.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Data Integrity Checks', () => {
    it('should calculate consistent checksums for same data', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.emailAddress(),
            age: fc.integer({ min: 0, max: 120 }),
          }),
          (data) => {
            const checksum1 = DataIntegrityChecker.calculateChecksum(data);
            const checksum2 = DataIntegrityChecker.calculateChecksum(data);
            
            expect(checksum1).toBe(checksum2);
            expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce different checksums for different data', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          (data1, data2) => {
            fc.pre(JSON.stringify(data1) !== JSON.stringify(data2));
            
            const checksum1 = DataIntegrityChecker.calculateChecksum(data1);
            const checksum2 = DataIntegrityChecker.calculateChecksum(data2);
            
            expect(checksum1).not.toBe(checksum2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should verify data integrity correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (tableName, recordId, data) => {
            const expectedChecksum = DataIntegrityChecker.calculateChecksum(data);
            
            // Mock successful database query
            mockPrismaClient[tableName as keyof typeof mockPrismaClient] = {
              findUnique: vi.fn().mockResolvedValue(data),
            };
            
            const isValid = await integrityChecker.verifyIntegrity(
              tableName,
              recordId,
              expectedChecksum
            );
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Transaction Boundary Management', () => {
    it('should execute transactions with proper timeout handling', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 10, max: 100 }),
          async (timeout, operationDelay) => {
            const operation = vi.fn().mockImplementation(async () => {
              await new Promise(resolve => setTimeout(resolve, operationDelay));
              return 'success';
            });

            mockPrismaClient.$transaction.mockImplementation(async (callback) => {
              return await callback(mockPrismaClient);
            });

            if (operationDelay < timeout) {
              const result = await transactionManager.executeInTransaction(
                operation,
                { timeout }
              );
              
              expect(result).toBe('success');
              expect(operation).toHaveBeenCalledWith(mockPrismaClient);
            } else {
              // Should timeout
              await expect(
                transactionManager.executeInTransaction(operation, { timeout })
              ).rejects.toThrow('Transaction timeout');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should retry operations on deadlock with exponential backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 50, max: 200 }),
          async (maxRetries, baseDelay) => {
            let attemptCount = 0;
            const operation = vi.fn().mockImplementation(async () => {
              attemptCount++;
              if (attemptCount <= maxRetries) {
                throw new Error('deadlock detected');
              }
              return 'success';
            });

            const result = await transactionManager.executeWithRetry(
              operation,
              maxRetries,
              baseDelay
            );

            expect(result).toBe('success');
            expect(attemptCount).toBe(maxRetries + 1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fail after max retries on persistent deadlock', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (maxRetries) => {
            const operation = vi.fn().mockRejectedValue(new Error('deadlock detected'));

            await expect(
              transactionManager.executeWithRetry(operation, maxRetries)
            ).rejects.toThrow('deadlock detected');

            expect(operation).toHaveBeenCalledTimes(maxRetries + 1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Performance Metrics and Recommendations', () => {
    it('should generate appropriate recommendations based on metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 100, max: 2000 }),
          fc.boolean(),
          async (slowQueryCount, averageDuration, hasNPlusOne) => {
            // Simulate metrics
            const middleware = vi.mocked(mockPrismaClient.$use).mock.calls[0]?.[0];
            
            if (middleware) {
              for (let i = 0; i < (hasNPlusOne ? 15 : 5); i++) {
                const params = { model: 'test', action: 'findMany' };
                const next = vi.fn().mockImplementation(async () => {
                  await new Promise(resolve => setTimeout(resolve, averageDuration));
                  return { id: i };
                });
                
                await middleware(params, next);
              }
            }

            const report = performanceMonitor.getPerformanceReport();
            
            if (hasNPlusOne) {
              expect(report.recommendations).toContain(
                'N+1 queries detected - consider using include/select to fetch related data'
              );
            }
            
            if (averageDuration > 500) {
              expect(report.recommendations).toContain(
                'High average query duration - review query performance'
              );
            }
            
            expect(report.queries).toBeDefined();
            expect(report.connections).toBeDefined();
            expect(Array.isArray(report.recommendations)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});