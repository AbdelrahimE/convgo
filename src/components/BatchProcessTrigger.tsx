
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoCircledIcon } from '@radix-ui/react-icons';

export function BatchProcessTrigger() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const triggerBatchProcess = async () => {
    try {
      setIsProcessing(true);
      setResult(null);
      
      const { data, error } = await supabase.functions.invoke('trigger-batch-process', {
        method: 'POST',
        body: { timestamp: new Date().toISOString() }
      });
      
      if (error) throw error;
      
      setResult(data);
      
      if (data.success) {
        toast.success('Message batch processing triggered successfully');
      } else {
        toast.error('Failed to trigger message batch processing');
      }
    } catch (error) {
      console.error('Error triggering batch process:', error);
      toast.error('Error triggering batch process', { 
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      
      setResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="my-4">
      <CardHeader>
        <CardTitle>Manual Message Batch Processing</CardTitle>
        <CardDescription>
          Manually trigger the message batch processing function to process any pending messages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <InfoCircledIcon className="h-4 w-4" />
          <AlertTitle>Debug Tool</AlertTitle>
          <AlertDescription>
            This tool is for testing purposes. It manually triggers the same function that runs on schedule to process queued WhatsApp messages. 
            Use this if messages are not being processed automatically.
          </AlertDescription>
        </Alert>

        <Button 
          onClick={triggerBatchProcess} 
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Trigger Message Batch Processing'
          )}
        </Button>
      </CardContent>
      {result && (
        <CardFooter className="flex flex-col items-start">
          <div className="w-full">
            <h3 className="font-medium mb-2">Result:</h3>
            <div className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-64">
              <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
