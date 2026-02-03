import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { useOfflineQueue, QueuedOperation } from '../useOfflineQueue';

/**
 * **Validates: Requirements Hata Kataloğu Kategori 11 - Offline Scenarios**
 * 
 * Property-based testler offline queue işlevselliğinin tüm senaryolarda
 * doğru çalıştığını garanti eder.
 */

// Mock useNetworkStatus
vi.mock('../useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({
    isOnline: true,
    isSlowConnection: false,
    connectionType: 'wifi',
    effectiveType: '4g',
  })),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Custom arbitraries for test data generation
const operationTypeArb = fc.constantFrom('CREATE', 'UPDATE', 'DELETE');
const resourceArb = fc.string({ minLength: 1, maxLength: 100 }).map(s => `/api/${s}`);
const dataArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  id: fc.option(fc.integer({ min: 1, max: 1000 })),
  description: fc.option(fc.string({ maxLength: 200 })),
});

const queuedOperationArb = fc.record({
  type: operationTypeArb,
  resource: resourceArb,
  data: dataArb,
});

describe('useOfflineQueue Property Tests', () => {
  const mockNetworkStatus = vi.mocked(
    await import('../useNetworkStatus')
  ).useNetworkStatus;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    mockNetworkStatus.mockReturnValue({
      isOnline: true,
      isSlowConnection: false,
      connectionType: 'wifi',
      effectiveType: '4g',
    });
  });

  /**
   * **Property Test:** App remains functional when network is offline
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Offline Scenarios**
   */
  it('Property: App remains functional when network is offline', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArb, { minLength: 1, maxLength: 10 }),
        (operations) => {
          // Network offline durumunu simüle et
          mockNetworkStatus.mockReturnValue({
            isOnline: false,
            isSlowConnection: false,
            connectionType: 'none',
            effectiveType: 'none',
          });

          const { result } = renderHook(() => useOfflineQueue());

          // Offline durumda operations eklenebilmeli
          const addedIds: string[] = [];
          act(() => {
            operations.forEach(op => {
              const id = result.current.addToQueue(op);
              addedIds.push(id);
            });
          });

          // Tüm operations queue'ya eklenmiş olmalı
          expect(result.current.queue).toHaveLength(operations.length);
          
          // Her operation doğru şekilde queue'da olmalı
          operations.forEach((op, index) => {
            expect(result.current.queue[index]).toMatchObject({
              type: op.type,
              resource: op.resource,
              data: op.data,
              retryCount: 0,
            });
          });

          // Queue statistics doğru olmalı
          const stats = result.current.getQueueStats();
          expect(stats.total).toBe(operations.length);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Property Test:** Queued operations execute after reconnection
   * **Validates: Requirements Hata Kataloğu Kategori 11 - Offline Scenarios**
   */
  it('Property: Queued operations execute after reconnection', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArb, { minLength: 1, maxLength: 5 }),
        async (operations) => {
          // Başlangıçta offline
          mockNetworkStatus.mockReturnValue({
            isOnline: false,
            isSlowConnection: false,
            connectionType: 'none',
            effectiveType: 'none',
          });

          const { result } = renderHook(() => useOfflineQueue());
          const mockExecute = vi.fn().mockResolvedValue({ success: true });

          // Operations'ları offline durumda ekle
          act(() => {
            operations.forEach(op => {
              result.current.addToQueue(op);
            });
          });

          expect(result.current.queue).toHaveLength(operations.length);

          // Network'ü online yap
          mockNetworkStatus.mockReturnValue({
            isOnline: true,
            isSlowConnection: false,
            connectionType: 'wifi',
            effectiveType: '4g',
          });

          // Queue'yu process et
          await act(async () => {
            await result.current.processQueue(mockExecute);
          });

          // Tüm operations execute edilmiş olmalı
          expect(mockExecute).toHaveBeenCalledTimes(operations.length);
          
          // Queue boş olmalı
          expect(result.current.queue).toHaveLength(0);

          // Her operation doğru parametrelerle çağrılmış olmalı
          operations.forEach((op, index) => {
            expect(mockExecute).toHaveBeenNthCalledWith(
              index + 1,
              expect.objectContaining({
                type: op.type,
                resource: op.resource,
                data: op.data,
              })
            );
          });

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Property Test:** Queue operations maintain data integrity
   */
  it('Property: Queue operations maintain data integrity', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArb, { minLength: 1, maxLength: 20 }),
        (operations) => {
          const { result } = renderHook(() => useOfflineQueue());

          // Operations'ları ekle
          const addedIds: string[] = [];
          act(() => {
            operations.forEach(op => {
              const id = result.current.addToQueue(op);
              addedIds.push(id);
            });
          });

          // Queue'daki her item'ın unique ID'si olmalı
          const queueIds = result.current.queue.map(op => op.id);
          const uniqueIds = new Set(queueIds);
          expect(uniqueIds.size).toBe(queueIds.length);

          // Eklenen ID'ler queue'daki ID'lerle eşleşmeli
          expect(new Set(addedIds)).toEqual(new Set(queueIds));

          // Her operation'ın gerekli field'ları olmalı
          result.current.queue.forEach((queuedOp, index) => {
            expect(queuedOp.id).toBeDefined();
            expect(queuedOp.timestamp).toBeGreaterThan(0);
            expect(queuedOp.retryCount).toBe(0);
            expect(queuedOp.maxRetries).toBeGreaterThan(0);
            expect(queuedOp.type).toBe(operations[index].type);
            expect(queuedOp.resource).toBe(operations[index].resource);
            expect(queuedOp.data).toEqual(operations[index].data);
          });

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Property Test:** Retry logic with exponential backoff works correctly
   */
  it('Property: Retry logic with exponential backoff works correctly', () => {
    fc.assert(
      fc.property(
        queuedOperationArb,
        fc.integer({ min: 1, max: 5 }), // maxRetries
        fc.integer({ min: 100, max: 2000 }), // retryDelay
        async (operation, maxRetries, retryDelay) => {
          const { result } = renderHook(() => 
            useOfflineQueue({ maxRetries, retryDelay })
          );

          // Başarısız execution mock'u
          const mockExecute = vi.fn().mockRejectedValue(new Error('Network error'));

          act(() => {
            result.current.addToQueue(operation);
          });

          // maxRetries kadar deneme yapmalı
          for (let i = 0; i < maxRetries; i++) {
            await act(async () => {
              await result.current.processQueue(mockExecute);
            });

            if (i < maxRetries - 1) {
              // Henüz max retry'a ulaşmadıysa queue'da olmalı
              expect(result.current.queue).toHaveLength(1);
              expect(result.current.queue[0].retryCount).toBe(i + 1);
            }
          }

          // Son denemeden sonra queue'dan kaldırılmalı
          expect(result.current.queue).toHaveLength(0);
          expect(mockExecute).toHaveBeenCalledTimes(maxRetries);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Property Test:** Queue statistics are always accurate
   */
  it('Property: Queue statistics are always accurate', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArb, { minLength: 0, maxLength: 15 }),
        (operations) => {
          const { result } = renderHook(() => useOfflineQueue());

          act(() => {
            operations.forEach(op => {
              result.current.addToQueue(op);
            });
          });

          const stats = result.current.getQueueStats();

          // Total count doğru olmalı
          expect(stats.total).toBe(operations.length);

          // Type counts doğru olmalı
          const expectedByType = operations.reduce((acc, op) => {
            acc[op.type] = (acc[op.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          expect(stats.byType).toEqual(expectedByType);

          // Resource counts doğru olmalı
          const expectedByResource = operations.reduce((acc, op) => {
            acc[op.resource] = (acc[op.resource] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          expect(stats.byResource).toEqual(expectedByResource);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Property Test:** LocalStorage persistence works correctly
   */
  it('Property: LocalStorage persistence works correctly', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArb, { minLength: 1, maxLength: 10 }),
        (operations) => {
          const { result } = renderHook(() => useOfflineQueue());

          act(() => {
            operations.forEach(op => {
              result.current.addToQueue(op);
            });
          });

          // localStorage.setItem çağrılmış olmalı
          expect(localStorageMock.setItem).toHaveBeenCalled();

          // Son çağrıda queue serialize edilmiş olmalı
          const lastCall = localStorageMock.setItem.mock.calls[
            localStorageMock.setItem.mock.calls.length - 1
          ];
          expect(lastCall[0]).toBe('autoqa_offline_queue');
          
          const serializedQueue = JSON.parse(lastCall[1]);
          expect(serializedQueue).toHaveLength(operations.length);

          // Serialize edilen data doğru olmalı
          serializedQueue.forEach((serializedOp: any, index: number) => {
            expect(serializedOp.type).toBe(operations[index].type);
            expect(serializedOp.resource).toBe(operations[index].resource);
            expect(serializedOp.data).toEqual(operations[index].data);
          });

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});