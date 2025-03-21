
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const WhatsAppMediaTest: React.FC = () => {
  const [encryptedUrl, setEncryptedUrl] = useState('');
  const [mediaKey, setMediaKey] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  // For debug information
  const [debugInfo, setDebugInfo] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleDecryptAndTranscribe = async () => {
    if (!encryptedUrl.trim() || !mediaKey.trim()) {
      toast.error('Please provide both the encrypted URL and media key');
      return;
    }

    try {
      setIsProcessing(true);
      setStatus('idle');
      setTranscription('');
      setDebugInfo('Starting decryption and transcription process...');
      
      // Call our edge function with the encrypted URL and media key
      const { data, error } = await supabase.functions.invoke('whatsapp-test-decrypt', {
        body: {
          audioUrl: encryptedUrl.trim(),
          mediaKey: mediaKey.trim(),
        }
      });

      if (error) {
        console.error('Error in decryption/transcription:', error);
        setDebugInfo(prevInfo => prevInfo + '\n\nError: ' + error.message);
        setStatus('error');
        toast.error('Failed: ' + error.message);
        return;
      }

      if (data.success) {
        setTranscription(data.transcription || 'No text detected in audio');
        setDebugInfo(prevInfo => prevInfo + '\n\nSuccess! Audio transcribed successfully.');
        setStatus('success');
        toast.success('Audio successfully decrypted and transcribed');
      } else {
        setDebugInfo(prevInfo => prevInfo + '\n\nProcess failed: ' + (data.error || 'Unknown error'));
        setStatus('error');
        toast.error('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error:', error);
      setDebugInfo(prevInfo => prevInfo + '\n\nException: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setStatus('error');
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-6 w-6 text-blue-500" />
            WhatsApp Media Decryption Test
          </CardTitle>
          <CardDescription>
            Experimental tool for testing decryption of WhatsApp encrypted voice messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="encrypted-url" className="text-sm font-medium">
              Encrypted Media URL (.enc file)
            </label>
            <Input
              id="encrypted-url"
              placeholder="https://mmg.whatsapp.net/..."
              value={encryptedUrl}
              onChange={(e) => setEncryptedUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Full URL to the encrypted WhatsApp voice message (.enc file)
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="media-key" className="text-sm font-medium">
              Media Key (Base64)
            </label>
            <Input
              id="media-key"
              placeholder="Base64 encoded media key..."
              value={mediaKey}
              onChange={(e) => setMediaKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The base64-encoded media key provided by WhatsApp for decryption
            </p>
          </div>

          <Button 
            onClick={handleDecryptAndTranscribe} 
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Decrypt & Transcribe'
            )}
          </Button>

          {status === 'success' && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center gap-2 mb-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="font-medium">Transcription Result</h3>
              </div>
              <p className="text-gray-700">{transcription}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center gap-2 mb-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-medium">Process Failed</h3>
              </div>
              <p className="text-gray-700">Check the debug information below for details.</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="debug-info" className="text-sm font-medium">
              Debug Information
            </label>
            <Textarea
              id="debug-info"
              readOnly
              value={debugInfo}
              className="h-32 font-mono text-xs bg-gray-50"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppMediaTest;
