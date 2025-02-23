
import React from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { AlertCircle, WifiOff } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface NetworkErrorBoundaryProps {
  children: React.ReactNode;
}

export function NetworkErrorBoundary({ children }: NetworkErrorBoundaryProps) {
  const { online } = useNetworkStatus();

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-2"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Retry Connection
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
