import { WifiIcon, WifiOffIcon, SignalIcon } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { cn } from '../../utils/cn';

interface NetworkStatusIndicatorProps {
  className?: string;
  showText?: boolean;
}

export function NetworkStatusIndicator({ className, showText = false }: NetworkStatusIndicatorProps) {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus();

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500';
    if (isSlowConnection) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isSlowConnection) return `Slow (${effectiveType})`;
    return `Online (${effectiveType})`;
  };

  const StatusIcon = !isOnline ? WifiOffIcon : isSlowConnection ? SignalIcon : WifiIcon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusIcon 
        className={cn('h-4 w-4', getStatusColor())} 
        aria-label={getStatusText()}
      />
      {showText && (
        <span className={cn('text-sm font-medium', getStatusColor())}>
          {getStatusText()}
        </span>
      )}
    </div>
  );
}