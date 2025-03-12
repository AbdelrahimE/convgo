
import React, { useState } from 'react';
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
import { Loader2 } from 'lucide-react';

const WhatsAppWebSocketManager: React.FC = () => {
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState<'stopped' | 'starting' | 'running'>('stopped');

  const startWebSocketConnection = async () => {
    try {
      setIsStarting(true);
      setStatus('starting');
      
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
      } else {
        toast.error('Failed to start WebSocket connection', {
          description: data.message || 'Unknown error'
        });
        setStatus('stopped');
      }
    } catch (error) {
      console.error('Error starting WebSocket connection:', error);
      toast.error('Error starting WebSocket connection');
      setStatus('stopped');
    } finally {
      setIsStarting(false);
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
                  : 'bg-red-500'
            }`}
          />
          <span className="text-sm font-medium">
            {status === 'running' 
              ? 'Connected and processing messages' 
              : status === 'starting' 
                ? 'Connecting...' 
                : 'Disconnected'}
          </span>
        </div>
        
        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            When active, the AI system will automatically respond to incoming WhatsApp messages
            using the configured system prompts and knowledge base files.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={startWebSocketConnection} 
          disabled={isStarting || status === 'running'}
          className="w-full"
        >
          {isStarting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : status === 'running' ? (
            'Connected'
          ) : (
            'Start AI Connection'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WhatsAppWebSocketManager;
