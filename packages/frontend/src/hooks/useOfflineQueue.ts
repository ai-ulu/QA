import { useState, useEffect, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';

export interface QueuedOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  resource: string;
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface OfflineQueueOptions {
  maxRetries?: number;
  retryDelay?: number;
  storageKey?: string;
}

export function useOfflineQueue(options: OfflineQueueOptions = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    storageKey = 'autoqa_offline_queue'
  } = options;

  const { isOnline } = useNetworkStatus();
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem(storageKey);
      if (savedQueue) {
        const parsedQueue = JSON.parse(savedQueue);
        setQueue(parsedQueue);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }, [storageKey]);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }, [queue, storageKey]);

  // Add operation to queue
  const addToQueue = useCallback((operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => {
    const queuedOperation: QueuedOperation = {
      ...operation,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries,
    };

    setQueue(prev => [...prev, queuedOperation]);
    return queuedOperation.id;
  }, [maxRetries]);

  // Remove operation from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(op => op.id !== id));
  }, []);

  // Process queue with exponential backoff
  const processQueue = useCallback(async (executeOperation: (operation: QueuedOperation) => Promise<void>) => {
    if (!isOnline || isProcessing || queue.length === 0) {
      return;
    }

    setIsProcessing(true);

    try {
      const operationsToProcess = [...queue];
      
      for (const operation of operationsToProcess) {
        try {
          await executeOperation(operation);
          removeFromQueue(operation.id);
        } catch (error) {
          console.error(`Failed to process operation ${operation.id}:`, error);
          
          // Update retry count
          setQueue(prev => prev.map(op => 
            op.id === operation.id 
              ? { ...op, retryCount: op.retryCount + 1 }
              : op
          ));

          // Remove if max retries reached
          if (operation.retryCount >= operation.maxRetries) {
            console.error(`Max retries reached for operation ${operation.id}, removing from queue`);
            removeFromQueue(operation.id);
          } else {
            // Wait before next retry with exponential backoff
            const delay = retryDelay * Math.pow(2, operation.retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isOnline, isProcessing, queue, removeFromQueue, retryDelay]);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Get queue statistics
  const getQueueStats = useCallback(() => {
    return {
      total: queue.length,
      byType: queue.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byResource: queue.reduce((acc, op) => {
        acc[op.resource] = (acc[op.resource] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }, [queue]);

  return {
    queue,
    isProcessing,
    addToQueue,
    removeFromQueue,
    processQueue,
    clearQueue,
    getQueueStats,
  };
}