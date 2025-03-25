
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, MessageSquare, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BatchStats {
  pendingCount: number;
  processedCount: number;
  totalCount: number;
  averageBatchSize: number;
}

export function MessageBatchingInfo() {
  const [showInfo, setShowInfo] = useState(true);
  
  // Fetch batch statistics
  const { data: batchStats, isLoading } = useQuery({
    queryKey: ['batchStats'],
    queryFn: async (): Promise<BatchStats> => {
      // Get count of pending messages
      const { count: pendingCount, error: pendingError } = await supabase
        .from('whatsapp_message_buffer')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (pendingError) throw pendingError;
      
      // Get count of processed messages
      const { count: processedCount, error: processedError } = await supabase
        .from('whatsapp_message_buffer')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processed');
      
      if (processedError) throw processedError;
      
      // Get batch information for calculating average size
      // Instead of using group_by, we'll get all processed messages with batch_ids
      const { data: batchedMessages, error: batchError } = await supabase
        .from('whatsapp_message_buffer')
        .select('batch_id, id')
        .eq('status', 'processed')
        .not('batch_id', 'is', null);
      
      if (batchError) throw batchError;
      
      // Calculate average batch size by counting messages per batch_id
      let averageBatchSize = 0;
      if (batchedMessages && batchedMessages.length > 0) {
        // Create a map to count messages per batch
        const batchCounts = new Map<string, number>();
        
        batchedMessages.forEach(message => {
          if (!message.batch_id) return;
          
          const batchId = message.batch_id;
          batchCounts.set(batchId, (batchCounts.get(batchId) || 0) + 1);
        });
        
        // Calculate the average
        if (batchCounts.size > 0) {
          const total = Array.from(batchCounts.values()).reduce((sum, count) => sum + count, 0);
          averageBatchSize = total / batchCounts.size;
        }
      }
      
      return {
        pendingCount: pendingCount || 0,
        processedCount: processedCount || 0,
        totalCount: (pendingCount || 0) + (processedCount || 0),
        averageBatchSize: Math.round(averageBatchSize * 10) / 10
      };
    },
    refetchInterval: 10000, // Refetch every 10 seconds
    placeholderData: {
      pendingCount: 0,
      processedCount: 0,
      totalCount: 0,
      averageBatchSize: 0
    }
  });

  if (!showInfo) return null;

  return (
    <Card className="mb-6 border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Message Batching System</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowInfo(false)}>
            Dismiss
          </Button>
        </div>
        <CardDescription>
          Messages are automatically grouped for more efficient processing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="bg-blue-50 mb-3">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertTitle>Intelligent Message Processing</AlertTitle>
          <AlertDescription>
            The system automatically groups messages from the same user sent within a short time window.
            This improves response quality and reduces token usage.
          </AlertDescription>
        </Alert>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="flex flex-col items-center p-3 border rounded-md bg-slate-50">
            <Clock className="h-5 w-5 text-blue-500 mb-1" />
            <div className="text-sm font-medium">Batch Window</div>
            <div className="text-xl font-bold">8 seconds</div>
            <div className="text-xs text-muted-foreground">Wait time for grouping</div>
          </div>
          
          <div className="flex flex-col items-center p-3 border rounded-md bg-slate-50">
            <MessageSquare className="h-5 w-5 text-green-500 mb-1" />
            <div className="text-sm font-medium">Average Batch</div>
            <div className="text-xl font-bold">{isLoading ? '...' : batchStats.averageBatchSize}</div>
            <div className="text-xs text-muted-foreground">Messages per batch</div>
          </div>
          
          <div className="flex flex-col items-center p-3 border rounded-md bg-slate-50">
            <div className="flex space-x-1 mb-1">
              <Badge variant="outline" className="bg-green-100">
                {isLoading ? '...' : batchStats.processedCount} Processed
              </Badge>
              <Badge variant="outline" className="bg-yellow-100">
                {isLoading ? '...' : batchStats.pendingCount} Pending
              </Badge>
            </div>
            <div className="text-sm font-medium">Total Messages</div>
            <div className="text-xl font-bold">{isLoading ? '...' : batchStats.totalCount}</div>
            <div className="text-xs text-muted-foreground">In the buffer system</div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Info className="h-4 w-4 mr-2" />
              How it works
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <h4 className="font-medium">Message Batching Process</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>New messages are stored in a buffer</li>
                <li>The system waits 8 seconds for more messages</li>
                <li>Messages from the same sender are grouped</li>
                <li>AI processes the group as a single conversation</li>
                <li>One comprehensive response is sent back</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-2">
                This improves the AI's ability to understand context across multiple questions and reduces processing overhead.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </CardFooter>
    </Card>
  );
}
