import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useOfflineQueue, QueuedOperation } from '../useOfflineQueue';

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

describe('useOfflineQueue', () => {
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

  describe('Temel işlevsellik', () => {
    it('başlangıçta boş queue ile başlamalı', () => {
      const { result } = renderHook(() => useOfflineQueue());

      expect(result.current.queue).toEqual([]);
      expect(result.current.isProcessing).toBe(false);
    });

    it('localStorage\'dan queue\'yu yüklemeli', () => {
      const savedQueue = [
        {
          id: 'test-1',
          type: 'CREATE' as const,
          resource: '/api/projects',
          data: { name: 'Test Project' },
          timestamp: Date.now(),
          retryCount: 0,
          maxRetries: 3,
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedQueue));

      const { result } = renderHook(() => useOfflineQueue());

      expect(result.current.queue).toEqual(savedQueue);
    });

    it('localStorage parse hatası durumunda graceful fallback yapmalı', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useOfflineQueue());

      expect(result.current.queue).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load offline queue:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Queue operations', () => {
    it('queue\'ya operation eklemeli', () => {
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        const id = result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });

        expect(id).toBeDefined();
        expect(result.current.queue).toHaveLength(1);
        expect(result.current.queue[0]).toMatchObject({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
          retryCount: 0,
        });
      });
    });

    it('queue\'dan operation kaldırmalı', () => {
      const { result } = renderHook(() => useOfflineQueue());

      let operationId: string;
      act(() => {
        operationId = result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      act(() => {
        result.current.removeFromQueue(operationId);
      });

      expect(result.current.queue).toHaveLength(0);
    });

    it('queue\'yu tamamen temizlemeli', () => {
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project 1' },
        });
        result.current.addToQueue({
          type: 'UPDATE',
          resource: '/api/projects/1',
          data: { name: 'Test Project 2' },
        });
      });

      expect(result.current.queue).toHaveLength(2);

      act(() => {
        result.current.clearQueue();
      });

      expect(result.current.queue).toHaveLength(0);
    });
  });

  describe('Queue processing', () => {
    it('online olduğunda queue\'yu process etmeli', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ success: true });
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      await act(async () => {
        await result.current.processQueue(mockExecute);
      });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(result.current.queue).toHaveLength(0);
    });

    it('offline olduğunda queue\'yu process etmemeli', async () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const mockExecute = vi.fn();
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      await act(async () => {
        await result.current.processQueue(mockExecute);
      });

      expect(mockExecute).not.toHaveBeenCalled();
      expect(result.current.queue).toHaveLength(1);
    });

    it('execution hatası durumunda retry count\'u artırmalı', async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      await act(async () => {
        await result.current.processQueue(mockExecute);
      });

      expect(result.current.queue[0].retryCount).toBe(1);
    });

    it('max retry\'a ulaştığında operation\'ı queue\'dan kaldırmalı', async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useOfflineQueue({ maxRetries: 1 }));

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      // İlk deneme
      await act(async () => {
        await result.current.processQueue(mockExecute);
      });

      expect(result.current.queue).toHaveLength(1);
      expect(result.current.queue[0].retryCount).toBe(1);

      // İkinci deneme (max retry)
      await act(async () => {
        await result.current.processQueue(mockExecute);
      });

      expect(result.current.queue).toHaveLength(0);
    });
  });

  describe('Queue statistics', () => {
    it('doğru queue istatistiklerini döndürmeli', () => {
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Project 1' },
        });
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/scenarios',
          data: { name: 'Scenario 1' },
        });
        result.current.addToQueue({
          type: 'UPDATE',
          resource: '/api/projects/1',
          data: { name: 'Updated Project' },
        });
      });

      const stats = result.current.getQueueStats();

      expect(stats.total).toBe(3);
      expect(stats.byType).toEqual({
        CREATE: 2,
        UPDATE: 1,
      });
      expect(stats.byResource).toEqual({
        '/api/projects': 1,
        '/api/scenarios': 1,
        '/api/projects/1': 1,
      });
    });
  });

  describe('LocalStorage integration', () => {
    it('queue değişikliklerini localStorage\'a kaydetmeli', () => {
      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'autoqa_offline_queue',
        expect.stringContaining('CREATE')
      );
    });

    it('localStorage save hatası durumunda graceful fallback yapmalı', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useOfflineQueue());

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save offline queue:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Custom options', () => {
    it('custom maxRetries değerini kullanmalı', () => {
      const { result } = renderHook(() => useOfflineQueue({ maxRetries: 5 }));

      act(() => {
        result.current.addToQueue({
          type: 'CREATE',
          resource: '/api/projects',
          data: { name: 'Test Project' },
        });
      });

      expect(result.current.queue[0].maxRetries).toBe(5);
    });

    it('custom storageKey kullanmalı', () => {
      renderHook(() => useOfflineQueue({ storageKey: 'custom_queue' }));

      expect(localStorageMock.getItem).toHaveBeenCalledWith('custom_queue');
    });
  });
});