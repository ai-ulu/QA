import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineQueue, QueuedOperation } from '../hooks/useOfflineQueue';
import { serviceWorkerManager } from '../utils/serviceWorker';
import toast from 'react-hot-toast';

interface OfflineContextType {
  isOnline: boolean;
  isSlowConnection: boolean;
  queuedOperations: QueuedOperation[];
  isProcessingQueue: boolean;
  addToQueue: (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => string;
  processQueue: () => Promise<void>;
  clearQueue: () => void;
  getQueueStats: () => {
    total: number;
    byType: Record<string, number>;
    byResource: Record<string, number>;
  };
  retryFailedOperation: (id: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const networkStatus = useNetworkStatus();
  const [hasShownOfflineToast, setHasShownOfflineToast] = useState(false);
  const [hasShownOnlineToast, setHasShownOnlineToast] = useState(false);

  const {
    queue: queuedOperations,
    isProcessing: isProcessingQueue,
    addToQueue,
    processQueue: processOfflineQueue,
    clearQueue,
    getQueueStats,
  } = useOfflineQueue({
    maxRetries: 3,
    retryDelay: 1000,
    storageKey: 'autoqa_offline_queue',
  });

  // Register service worker on mount
  useEffect(() => {
    serviceWorkerManager.register().then((status) => {
      if (status.isRegistered) {
        console.log('Service worker registered successfully');
      }
    });

    // Listen for background sync success
    serviceWorkerManager.on('BACKGROUND_SYNC_SUCCESS', (data) => {
      toast.success('Offline changes synced successfully');
    });

    // Listen for service worker updates
    serviceWorkerManager.on('update-available', () => {
      toast((t) => (
        <div className="flex flex-col gap-2">
          <span>A new version is available!</span>
          <button
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
            onClick={() => {
              serviceWorkerManager.skipWaiting();
              toast.dismiss(t.id);
              window.location.reload();
            }}
          >
            Update Now
          </button>
        </div>
      ), { duration: 10000 });
    });

    return () => {
      serviceWorkerManager.off('BACKGROUND_SYNC_SUCCESS', () => {});
      serviceWorkerManager.off('update-available', () => {});
    };
  }, []);

  // Handle network status changes
  useEffect(() => {
    if (!networkStatus.isOnline && !hasShownOfflineToast) {
      toast.error('You are now offline. Changes will be queued for sync.', {
        duration: 5000,
        id: 'offline-status',
      });
      setHasShownOfflineToast(true);
      setHasShownOnlineToast(false);
    } else if (networkStatus.isOnline && hasShownOfflineToast && !hasShownOnlineToast) {
      toast.success('You are back online! Syncing queued changes...', {
        duration: 3000,
        id: 'online-status',
      });
      setHasShownOnlineToast(true);
      setHasShownOfflineToast(false);
      
      // Process queued operations when back online
      processQueue();
    }
  }, [networkStatus.isOnline, hasShownOfflineToast, hasShownOnlineToast]);

  // Process queue when network comes back online
  const processQueue = async () => {
    if (!networkStatus.isOnline || queuedOperations.length === 0) {
      return;
    }

    await processOfflineQueue(async (operation) => {
      // Execute the queued operation
      const response = await fetch(operation.resource, {
        method: operation.type === 'CREATE' ? 'POST' : 
                operation.type === 'UPDATE' ? 'PUT' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('autoqa_token')}`,
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    });
  };

  // Retry a specific failed operation
  const retryFailedOperation = async (id: string): Promise<void> => {
    const operation = queuedOperations.find(op => op.id === id);
    if (!operation) {
      throw new Error('Operation not found');
    }

    try {
      const response = await fetch(operation.resource, {
        method: operation.type === 'CREATE' ? 'POST' : 
                operation.type === 'UPDATE' ? 'PUT' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('autoqa_token')}`,
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Remove from queue on success
      // This will be handled by the processQueue function
      toast.success('Operation completed successfully');
    } catch (error) {
      toast.error(`Failed to retry operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const value: OfflineContextType = {
    isOnline: networkStatus.isOnline,
    isSlowConnection: networkStatus.isSlowConnection,
    queuedOperations,
    isProcessingQueue,
    addToQueue,
    processQueue,
    clearQueue,
    getQueueStats,
    retryFailedOperation,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}