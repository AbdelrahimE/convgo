
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

const WhatsAppWebSocketManager: React.FC = () => {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [status, setStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped');
  const [connectedInstances, setConnectedInstances] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
    // Poll status every 30 seconds
    const intervalId = setInterval(checkConnectionStatus, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-websocket', {
        body: { action: 'status' }
      });
      
      if (error) throw error;
      
      if (data.success && data.count > 0) {
        setStatus('running');
        setConnectedInstances(Object.keys(data.activeConnections));
        setErrorMessage(null);
      } else {
        setStatus('stopped');
        setConnectedInstances([]);
      }
    } catch (error) {
      console.error('Error checking WebSocket status:', error);
      // Don't show error toast on routine checks
    }
  };

  const startWebSocketConnection = async () => {
    try {
      setIsStarting(true);
      setStatus('starting');
      setErrorMessage(null);
      
      // Call the edge function to start the WebSocket connection
      const { data, error } = await supabase.functions.invoke('whatsapp-websocket', {
        body: { action: 'start' }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success('WebSocket connection started', {
          description: `Connected to ${data.instances.length} WhatsApp instance(s)`
        });
        setStatus('running');
        setConnectedInstances(data.instances || []);
      } else {
        setStatus('error');
        setErrorMessage(data.message || 'Unknown error');
        toast.error('Failed to start WebSocket connection', {
          description: data.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error starting WebSocket connection:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      toast.error('Error starting WebSocket connection');
    } finally {
      setIsStarting(false);
    }
  };

  const stopWebSocketConnection = async () => {
    try {
      setIsStopping(true);
      
      // Call the edge function to stop the WebSocket connection
      const { data, error } = await supabase.functions.invoke('whatsapp-websocket', {
        body: { action: 'stop' }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success('WebSocket connection stopped');
        setStatus('stopped');
        setConnectedInstances([]);
        setErrorMessage(null);
      } else {
        toast.error('Failed to stop WebSocket connection', {
          description: data.message || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error stopping WebSocket connection:', error);
      toast.error('Error stopping WebSocket connection');
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>WhatsApp AI Connection</CardTitle>
        <CardDescription>
          Manage the WebSocket connection between your WhatsApp instances and the AI system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          <div 
            className={`w-3 h-3 rounded-full ${
              status === 'running' 
                ? 'bg-green-500' 
                : status === 'starting' 
                  ? 'bg-yellow-500' 
                  : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-500'
            }`}
          />
          <span className="text-sm font-medium">
            {status === 'running' 
              ? 'Connected and processing messages' 
              : status === 'starting' 
                ? 'Connecting...' 
                : status === 'error'
                  ? 'Connection error'
                  : 'Disconnected'}
          </span>
        </div>
        
        {status === 'running' && connectedInstances.length > 0 && (
          <div className="mt-2 text-sm">
            <p className="font-medium">Connected instances:</p>
            <ul className="list-disc pl-5 mt-1">
              {connectedInstances.map((instance) => (
                <li key={instance}>{instance}</li>
              ))}
            </ul>
          </div>
        )}
        
        {status === 'error' && errorMessage && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        )}
        
        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            When active, the AI system will automatically respond to incoming WhatsApp messages
            using the configured system prompts and knowledge base files.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        {status === 'running' ? (
          <Button 
            onClick={stopWebSocketConnection} 
            disabled={isStopping}
            variant="destructive"
            className="w-full"
          >
            {isStopping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disconnecting...
              </>
            ) : (
              'Stop AI Connection'
            )}
          </Button>
        ) : (
          <Button 
            onClick={startWebSocketConnection} 
            disabled={isStarting}
            className="w-full"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Start AI Connection'
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default WhatsAppWebSocketManager;
