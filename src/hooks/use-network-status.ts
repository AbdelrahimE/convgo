
import { useState, useEffect } from 'react';

interface NetworkStatus {
  online: boolean;
  lastUpdate: Date;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    online: navigator.onLine,
    lastUpdate: new Date()
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus({
        online: true,
        lastUpdate: new Date()
      });
    };

    const handleOffline = () => {
      setStatus({
        online: false,
        lastUpdate: new Date()
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
