import { useState } from 'react';
import { RefreshCwIcon, WifiOffIcon, AlertCircleIcon } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface RetryButtonProps {
  onRetry: () => Promise<void>;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  children?: React.ReactNode;
  maxRetries?: number;
  retryCount?: number;
}

/**
 * Retry UX komponenti - Exponential backoff ile retry işlevselliği sağlar
 * Kullanıcıya net geri bildirim verir ve retry durumunu görsel olarak gösterir
 */
export function RetryButton({
  onRetry,
  disabled = false,
  className,
  variant = 'outline',
  size = 'sm',
  showIcon = true,
  children,
  maxRetries = 3,
  retryCount = 0,
}: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleRetry = async () => {
    if (isRetrying || disabled || retryCount >= maxRetries) {
      return;
    }

    setIsRetrying(true);
    setLastError(null);

    try {
      await onRetry();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Retry failed';
      setLastError(errorMessage);
    } finally {
      setIsRetrying(false);
    }
  };

  const isMaxRetriesReached = retryCount >= maxRetries;
  const buttonDisabled = disabled || isRetrying || isMaxRetriesReached;

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        size={size}
        onClick={handleRetry}
        disabled={buttonDisabled}
        isLoading={isRetrying}
        className={cn(
          'transition-all duration-200',
          isMaxRetriesReached && 'opacity-50 cursor-not-allowed',
          lastError && 'border-red-300 text-red-700',
          className
        )}
        aria-label={
          isRetrying 
            ? 'Retrying...' 
            : isMaxRetriesReached 
            ? 'Maximum retries reached' 
            : 'Retry operation'
        }
      >
        {showIcon && !isRetrying && (
          <RefreshCwIcon 
            className={cn(
              'h-3 w-3',
              children && 'mr-1'
            )} 
          />
        )}
        {showIcon && isRetrying && (
          <div className="h-3 w-3 mr-1 animate-spin rounded-full border border-current border-t-transparent" />
        )}
        {children || (
          isRetrying 
            ? 'Retrying...' 
            : isMaxRetriesReached 
            ? 'Max retries reached' 
            : `Retry${retryCount > 0 ? ` (${retryCount}/${maxRetries})` : ''}`
        )}
      </Button>
      
      {/* Retry count indicator */}
      {retryCount > 0 && !isMaxRetriesReached && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <WifiOffIcon className="h-3 w-3" />
          <span>Attempt {retryCount + 1} of {maxRetries}</span>
        </div>
      )}

      {/* Error message */}
      {lastError && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircleIcon className="h-3 w-3" />
          <span>{lastError}</span>
        </div>
      )}

      {/* Max retries reached message */}
      {isMaxRetriesReached && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircleIcon className="h-3 w-3" />
          <span>Maximum retry attempts reached. Please check your connection.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Exponential backoff hesaplama utility'si
 */
export function calculateRetryDelay(retryCount: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, retryCount), 30000); // Max 30 saniye
}

/**
 * Retry işlemi için wrapper hook
 */
export function useRetryWithBackoff(
  operation: () => Promise<void>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (retryCount: number) => void;
    onMaxRetriesReached?: () => void;
  } = {}
) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    onRetry,
    onMaxRetriesReached,
  } = options;

  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = async (): Promise<void> => {
    if (retryCount >= maxRetries) {
      onMaxRetriesReached?.();
      return;
    }

    setIsRetrying(true);
    
    try {
      // Exponential backoff delay
      if (retryCount > 0) {
        const delay = calculateRetryDelay(retryCount - 1, baseDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      await operation();
      
      // Reset retry count on success
      setRetryCount(0);
    } catch (error) {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      onRetry?.(newRetryCount);
      
      if (newRetryCount >= maxRetries) {
        onMaxRetriesReached?.();
      }
      
      throw error;
    } finally {
      setIsRetrying(false);
    }
  };

  const reset = () => {
    setRetryCount(0);
    setIsRetrying(false);
  };

  return {
    retry,
    reset,
    retryCount,
    isRetrying,
    isMaxRetriesReached: retryCount >= maxRetries,
  };
}