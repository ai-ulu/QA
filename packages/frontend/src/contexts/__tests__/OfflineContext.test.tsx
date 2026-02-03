import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineProvider, useOffline } from '../OfflineContext';
import toast from 'react-hot-toast';

// Mock dependencies
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({
    isOnline: true,
    isSlowConnection: false,
    connectionType: 'wifi',
    effectiveType: '4g',
  })),
}));

vi.mock('../hooks/useOfflineQueue', () => ({
  useOfflineQueue: vi.fn(() => ({
    queue: [],
    isProcessing: false,
    addToQueue: vi.fn(),
    processQueue: vi.fn(),
    clearQueue: vi.fn(),
    getQueueStats: vi.fn(() => ({ total: 0, byType: {}, byResource: {} })),
  })),
}));

vi.mock('../utils/serviceWorker', () => ({
  serviceWorkerManager: {
    register: vi.fn().mockResolvedValue({ isRegistered: true }),
    on: vi.fn(),
    off: vi.fn(),
    skipWaiting: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = vi.fn();

// Test component to access context
function TestComponent() {
  const offline = useOffline();
  
  return (
    <div>
      <div data-testid="online-status">{offline.isOnline ? 'online' : 'offline'}</div>
      <div data-testid="slow-connection">{offline.isSlowConnection ? 'slow' : 'fast'}</div>
      <div data-testid="queue-count">{offline.queuedOperations.length}</div>
      <div data-testid="processing">{offline.isProcessingQueue ? 'processing' : 'idle'}</div>
      <button 
        data-testid="add-operation" 
        onClick={() => offline.addToQueue({
          type: 'CREATE',
          resource: '/api/test',
          data: { test: true }
        })}
      >
        Add Operation
      </button>
      <button data-testid="process-queue" onClick={() => offline.processQueue()}>
        Process Queue
      </button>
      <button data-testid="clear-queue" onClick={() => offline.clearQueue()}>
        Clear Queue
      </button>
    </div>
  );
}

describe('OfflineContext', () => {
  const mockNetworkStatus = vi.mocked(
    await import('../hooks/useNetworkStatus')
  ).useNetworkStatus;
  
  const mockOfflineQueue = vi.mocked(
    await import('../hooks/useOfflineQueue')
  ).useOfflineQueue;

  const mockServiceWorker = vi.mocked(
    await import('../utils/serviceWorker')
  ).serviceWorkerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-token');
    
    mockNetworkStatus.mockReturnValue({
      isOnline: true,
      isSlowConnection: false,
      connectionType: 'wifi',
      effectiveType: '4g',
    });

    mockOfflineQueue.mockReturnValue({
      queue: [],
      isProcessing: false,
      addToQueue: vi.fn().mockReturnValue('mock-id'),
      processQueue: vi.fn(),
      clearQueue: vi.fn(),
      getQueueStats: vi.fn(() => ({ total: 0, byType: {}, byResource: {} })),
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Provider initialization', () => {
    it('should provide offline context to children', () => {
      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      expect(screen.getByTestId('online-status')).toHaveTextContent('online');
      expect(screen.getByTestId('slow-connection')).toHaveTextContent('fast');
      expect(screen.getByTestId('queue-count')).toHaveTextContent('0');
      expect(screen.getByTestId('processing')).toHaveTextContent('idle');
    });

    it('should register service worker on mount', async () => {
      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      await waitFor(() => {
        expect(mockServiceWorker.register).toHaveBeenCalled();
      });
    });

    it('should setup service worker event listeners', () => {
      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      expect(mockServiceWorker.on).toHaveBeenCalledWith(
        'BACKGROUND_SYNC_SUCCESS',
        expect.any(Function)
      );
      expect(mockServiceWorker.on).toHaveBeenCalledWith(
        'update-available',
        expect.any(Function)
      );
    });
  });

  describe('Network status changes', () => {
    it('should show offline toast when going offline', async () => {
      const { rerender } = render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      // Simulate going offline
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      rerender(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'You are now offline. Changes will be queued for sync.',
          expect.objectContaining({
            duration: 5000,
            id: 'offline-status',
          })
        );
      });
    });

    it('should show online toast and process queue when coming back online', async () => {
      // Start offline
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const { rerender } = render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      // Wait for offline toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      // Go back online
      mockNetworkStatus.mockReturnValue({
        isOnline: true,
        isSlowConnection: false,
        connectionType: 'wifi',
        effectiveType: '4g',
      });

      rerender(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'You are back online! Syncing queued changes...',
          expect.objectContaining({
            duration: 3000,
            id: 'online-status',
          })
        );
      });
    });
  });

  describe('Queue operations', () => {
    it('should add operations to queue', async () => {
      const mockAddToQueue = vi.fn().mockReturnValue('test-id');
      mockOfflineQueue.mockReturnValue({
        queue: [],
        isProcessing: false,
        addToQueue: mockAddToQueue,
        processQueue: vi.fn(),
        clearQueue: vi.fn(),
        getQueueStats: vi.fn(() => ({ total: 0, byType: {}, byResource: {} })),
      });

      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      const addButton = screen.getByTestId('add-operation');
      
      await act(async () => {
        addButton.click();
      });

      expect(mockAddToQueue).toHaveBeenCalledWith({
        type: 'CREATE',
        resource: '/api/test',
        data: { test: true }
      });
    });

    it('should process queue when online', async () => {
      const mockProcessQueue = vi.fn();
      mockOfflineQueue.mockReturnValue({
        queue: [{ 
          id: 'test-1', 
          type: 'CREATE', 
          resource: '/api/test', 
          data: { test: true },
          timestamp: Date.now(),
          retryCount: 0,
          maxRetries: 3
        }],
        isProcessing: false,
        addToQueue: vi.fn(),
        processQueue: mockProcessQueue,
        clearQueue: vi.fn(),
        getQueueStats: vi.fn(() => ({ total: 1, byType: { CREATE: 1 }, byResource: { '/api/test': 1 } })),
      });

      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      const processButton = screen.getByTestId('process-queue');
      
      await act(async () => {
        processButton.click();
      });

      expect(mockProcessQueue).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should not process queue when offline', async () => {
      mockNetworkStatus.mockReturnValue({
        isOnline: false,
        isSlowConnection: false,
        connectionType: 'none',
        effectiveType: 'none',
      });

      const mockProcessQueue = vi.fn();
      mockOfflineQueue.mockReturnValue({
        queue: [{ 
          id: 'test-1', 
          type: 'CREATE', 
          resource: '/api/test', 
          data: { test: true },
          timestamp: Date.now(),
          retryCount: 0,
          maxRetries: 3
        }],
        isProcessing: false,
        addToQueue: vi.fn(),
        processQueue: mockProcessQueue,
        clearQueue: vi.fn(),
        getQueueStats: vi.fn(() => ({ total: 1, byType: { CREATE: 1 }, byResource: { '/api/test': 1 } })),
      });

      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      const processButton = screen.getByTestId('process-queue');
      
      await act(async () => {
        processButton.click();
      });

      // processQueue should not be called when offline
      expect(mockProcessQueue).not.toHaveBeenCalled();
    });
  });

  describe('Retry failed operation', () => {
    it('should retry failed operation successfully', async () => {
      const mockQueue = [{ 
        id: 'test-1', 
        type: 'CREATE', 
        resource: '/api/test', 
        data: { test: true },
        timestamp: Date.now(),
        retryCount: 1,
        maxRetries: 3
      }];

      mockOfflineQueue.mockReturnValue({
        queue: mockQueue,
        isProcessing: false,
        addToQueue: vi.fn(),
        processQueue: vi.fn(),
        clearQueue: vi.fn(),
        getQueueStats: vi.fn(() => ({ total: 1, byType: { CREATE: 1 }, byResource: { '/api/test': 1 } })),
      });

      const TestRetryComponent = () => {
        const offline = useOffline();
        return (
          <button 
            data-testid="retry-operation"
            onClick={() => offline.retryFailedOperation('test-1')}
          >
            Retry
          </button>
        );
      };

      render(
        <OfflineProvider>
          <TestRetryComponent />
        </OfflineProvider>
      );

      const retryButton = screen.getByTestId('retry-operation');
      
      await act(async () => {
        retryButton.click();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token',
        },
        body: JSON.stringify({ test: true }),
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Operation completed successfully');
      });
    });

    it('should handle retry failure', async () => {
      const mockQueue = [{ 
        id: 'test-1', 
        type: 'CREATE', 
        resource: '/api/test', 
        data: { test: true },
        timestamp: Date.now(),
        retryCount: 1,
        maxRetries: 3
      }];

      mockOfflineQueue.mockReturnValue({
        queue: mockQueue,
        isProcessing: false,
        addToQueue: vi.fn(),
        processQueue: vi.fn(),
        clearQueue: vi.fn(),
        getQueueStats: vi.fn(() => ({ total: 1, byType: { CREATE: 1 }, byResource: { '/api/test': 1 } })),
      });

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const TestRetryComponent = () => {
        const offline = useOffline();
        return (
          <button 
            data-testid="retry-operation"
            onClick={async () => {
              try {
                await offline.retryFailedOperation('test-1');
              } catch (error) {
                // Expected to throw
              }
            }}
          >
            Retry
          </button>
        );
      };

      render(
        <OfflineProvider>
          <TestRetryComponent />
        </OfflineProvider>
      );

      const retryButton = screen.getByTestId('retry-operation');
      
      await act(async () => {
        retryButton.click();
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to retry operation: Network error'
        );
      });
    });
  });

  describe('Service worker events', () => {
    it('should handle background sync success', async () => {
      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      // Simulate background sync success event
      const backgroundSyncHandler = mockServiceWorker.on.mock.calls
        .find(call => call[0] === 'BACKGROUND_SYNC_SUCCESS')?.[1];

      if (backgroundSyncHandler) {
        act(() => {
          backgroundSyncHandler({ id: 'test-1', url: '/api/test' });
        });

        await waitFor(() => {
          expect(toast.success).toHaveBeenCalledWith('Offline changes synced successfully');
        });
      }
    });

    it('should handle service worker update available', async () => {
      render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      // Simulate update available event
      const updateHandler = mockServiceWorker.on.mock.calls
        .find(call => call[0] === 'update-available')?.[1];

      if (updateHandler) {
        act(() => {
          updateHandler();
        });

        // Toast should be called with update notification
        expect(toast).toHaveBeenCalled();
      }
    });
  });

  describe('Error handling', () => {
    it('should throw error when useOffline is used outside provider', () => {
      const TestComponentOutsideProvider = () => {
        useOffline();
        return <div>Test</div>;
      };

      expect(() => {
        render(<TestComponentOutsideProvider />);
      }).toThrow('useOffline must be used within an OfflineProvider');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup service worker listeners on unmount', () => {
      const { unmount } = render(
        <OfflineProvider>
          <TestComponent />
        </OfflineProvider>
      );

      unmount();

      expect(mockServiceWorker.off).toHaveBeenCalledWith(
        'BACKGROUND_SYNC_SUCCESS',
        expect.any(Function)
      );
      expect(mockServiceWorker.off).toHaveBeenCalledWith(
        'update-available',
        expect.any(Function)
      );
    });
  });
});