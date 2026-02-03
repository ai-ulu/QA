import { useState, useEffect } from 'react';
import { 
  WifiOffIcon, 
  CloudOffIcon, 
  RefreshCwIcon, 
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  XIcon
} from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Button } from './Button';
import { RetryButton } from './RetryButton';
import { cn } from '../../utils/cn';

interface QueuedOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  resource: string;
  timestamp: number;
  retryCount: number;
}

interface OfflineIndicatorProps {
  className?: string;
  onRetry?: () => Promise<void>;
  queuedOperationsCount?: number;
  queuedOperations?: QueuedOperation[];
  onClearQueue?: () => void;
  onRetryOperation?: (id: string) => Promise<void>;
  isProcessingQueue?: boolean;
  showDetails?: boolean;
}

export function OfflineIndicator({ 
  className, 
  onRetry, 
  queuedOperationsCount = 0,
  queuedOperations = [],
  onClearQueue,
  onRetryOperation,
  isProcessingQueue = false,
  showDetails = false
}: OfflineIndicatorProps) {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [showQueueDetails, setShowQueueDetails] = useState(showDetails);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      setShowReconnected(true);
      setLastSyncTime(new Date());
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  // Show reconnected message with sync status
  if (showReconnected) {
    return (
      <div className={cn(
        'fixed top-4 right-4 z-50 bg-green-100 border border-green-300 rounded-lg p-4 shadow-lg',
        'flex items-center gap-3 max-w-sm animate-in slide-in-from-right-2',
        className
      )}>
        <CheckCircleIcon className="h-5 w-5 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">
            Bağlantı yeniden kuruldu!
          </p>
          {isProcessingQueue && queuedOperationsCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span>{queuedOperationsCount} işlem senkronize ediliyor...</span>
            </div>
          )}
          {lastSyncTime && !isProcessingQueue && (
            <p className="text-xs text-green-600 mt-1">
              Son senkronizasyon: {lastSyncTime.toLocaleTimeString('tr-TR')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show slow connection warning
  if (isOnline && isSlowConnection) {
    return (
      <div className={cn(
        'fixed top-4 right-4 z-50 bg-orange-100 border border-orange-300 rounded-lg p-4 shadow-lg',
        'flex items-center gap-3 max-w-sm',
        className
      )}>
        <AlertCircleIcon className="h-5 w-5 text-orange-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-orange-800">
            Yavaş bağlantı
          </p>
          <p className="text-xs text-orange-600">
            İşlemler normalden daha uzun sürebilir.
          </p>
        </div>
      </div>
    );
  }

  // Don't show anything if online and not slow
  if (isOnline && !isSlowConnection) {
    return null;
  }

  // Offline indicator with enhanced UX
  return (
    <div className={cn(
      'fixed top-4 right-4 z-50 bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg',
      'max-w-sm animate-in slide-in-from-right-2',
      className
    )}>
      {/* Main offline indicator */}
      <div className="flex items-center gap-3 p-4">
        <CloudOffIcon className="h-5 w-5 text-yellow-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">
            Çevrimdışısınız
          </p>
          <p className="text-xs text-yellow-600">
            Değişiklikler kaydedilecek ve bağlantı kurulduğunda senkronize edilecek.
          </p>
          {queuedOperationsCount > 0 && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 text-xs text-yellow-600">
                <ClockIcon className="h-3 w-3" />
                <span>{queuedOperationsCount} işlem kuyrukta</span>
              </div>
              {queuedOperations.length > 0 && (
                <button
                  onClick={() => setShowQueueDetails(!showQueueDetails)}
                  className="text-xs text-yellow-700 hover:text-yellow-800 underline"
                >
                  {showQueueDetails ? 'Gizle' : 'Detayları göster'}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {onRetry && (
            <RetryButton
              onRetry={onRetry}
              variant="outline"
              size="sm"
              className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
            />
          )}
          {onClearQueue && queuedOperationsCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearQueue}
              className="text-yellow-700 hover:bg-yellow-100 h-6 px-2"
              title="Kuyruğu temizle"
            >
              <XIcon className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Queue details */}
      {showQueueDetails && queuedOperations.length > 0 && (
        <div className="border-t border-yellow-200 p-3 bg-yellow-25">
          <h4 className="text-xs font-medium text-yellow-800 mb-2">
            Bekleyen İşlemler:
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {queuedOperations.slice(0, 5).map((operation) => (
              <div
                key={operation.id}
                className="flex items-center justify-between text-xs bg-white rounded p-2 border border-yellow-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-xs font-medium',
                      operation.type === 'CREATE' && 'bg-green-100 text-green-700',
                      operation.type === 'UPDATE' && 'bg-blue-100 text-blue-700',
                      operation.type === 'DELETE' && 'bg-red-100 text-red-700'
                    )}>
                      {operation.type}
                    </span>
                    <span className="text-gray-600 truncate">
                      {operation.resource.split('/').pop()}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-1">
                    {new Date(operation.timestamp).toLocaleTimeString('tr-TR')}
                    {operation.retryCount > 0 && (
                      <span className="ml-2 text-orange-600">
                        ({operation.retryCount} deneme)
                      </span>
                    )}
                  </div>
                </div>
                {onRetryOperation && (
                  <RetryButton
                    onRetry={() => onRetryOperation(operation.id)}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-yellow-700"
                    showIcon={true}
                    retryCount={operation.retryCount}
                  />
                )}
              </div>
            ))}
            {queuedOperations.length > 5 && (
              <div className="text-xs text-yellow-600 text-center py-1">
                +{queuedOperations.length - 5} işlem daha...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessingQueue && (
        <div className="border-t border-yellow-200 p-3 bg-yellow-25">
          <div className="flex items-center gap-2 text-xs text-yellow-700">
            <div className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
            <span>İşlemler senkronize ediliyor...</span>
          </div>
        </div>
      )}
    </div>
  );
}