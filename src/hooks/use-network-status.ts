
import { useState, useEffect } from 'react';
import logger from '@/utils/logger';

interface NetworkStatus {
  online: boolean;
  lastUpdate: Date;
  retryCount: number;
  retryDelay: number;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    online: navigator.onLine,
    lastUpdate: new Date(),
    retryCount: 0,
    retryDelay: 1000
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({
        online: true,
        lastUpdate: new Date(),
        retryCount: 0,
        retryDelay: 1000
      }));
    };

    const handleOffline = () => {
      setStatus(prev => ({
        online: false,
        lastUpdate: new Date(),
        retryCount: prev.retryCount,
        retryDelay: Math.min(prev.retryDelay * 2, 30000) // Exponential backoff, max 30s
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const retry = async () => {
    if (!status.online) {
      setStatus(prev => ({
        ...prev,
        retryCount: prev.retryCount + 1,
        lastUpdate: new Date()
      }));

      // Try to reconnect
      try {
        const response = await fetch('/api/health-check');
        if (response.ok) {
          setStatus({
            online: true,
            lastUpdate: new Date(),
            retryCount: 0,
            retryDelay: 1000
          });
          return true;
        }
      } catch (error) {
        logger.error('Network retry failed:', error);
      }

      // Update retry delay with exponential backoff
      setStatus(prev => ({
        ...prev,
        retryDelay: Math.min(prev.retryDelay * 2, 30000)
      }));
      return false;
    }
    return true;
  };

  return { ...status, retry };
}
