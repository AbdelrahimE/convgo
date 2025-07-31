
import React, { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { AlertCircle, WifiOff, RefreshCw } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface NetworkErrorBoundaryProps {
  children: React.ReactNode;
  onOffline?: () => void;
  onOnline?: () => void;
}

export function NetworkErrorBoundary({ 
  children, 
  onOffline, 
  onOnline 
}: NetworkErrorBoundaryProps) {
  const { online, lastUpdate, retryCount, retryDelay, retry } = useNetworkStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!online) {
      onOffline?.();
    } else {
      onOnline?.();
    }
  }, [online, onOffline, onOnline]);

  useEffect(() => {
    if (isRetrying) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = (elapsed / retryDelay) * 100;
        
        if (newProgress >= 100) {
          setProgress(100);
          setIsRetrying(false);
          clearInterval(interval);
          retry();
        } else {
          setProgress(newProgress);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isRetrying, retryDelay, retry]);

  const handleRetry = async () => {
    setIsRetrying(true);
    const success = await retry();
    if (!success) {
      setIsRetrying(false);
    }
  };

  if (!online) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-md">
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Network Connection Lost</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-2">
              You're currently offline. Please check your internet connection.
            </p>
            <div className="space-y-4">
              {isRetrying && (
                <div className="space-y-2">
                  <Progress value={progress} className="h-1" />
                  <p className="text-xs opacity-70">
                    Attempting to reconnect... ({Math.round(retryDelay / 1000)}s)
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Retrying...' : `Retry ${retryCount > 0 ? `(${retryCount})` : ''}`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="gap-2"
                >
                  <AlertCircle className="h-4 w-4" />
                  Reload Page
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
