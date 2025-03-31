
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Headphones, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';

const WhisperAPITester: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  const testWhisperAPI = async () => {
    try {
      setIsTesting(true);
      setTestResult('idle');

      // Sample MP3 audio URL for testing
      const testAudioUrl = 'https://audio-samples.github.io/samples/mp3/blizzard_biased/sample-1.mp3';

      // Call the Edge Function to test transcription
      const {
        data,
        error
      } = await supabase.functions.invoke('whatsapp-voice-transcribe', {
        body: {
          audioUrl: testAudioUrl,
          mimeType: 'audio/mpeg' // Proper MIME type for MP3
        }
      });

      if (error) {
        logger.error('Error testing Whisper API:', error);
        setTestResult('error');
        toast.error('Whisper API test failed: ' + error.message);
        return;
      }

      if (data.success) {
        setTestResult('success');
        toast.success('Successfully connected to OpenAI Whisper API');
        logger.log('Transcription result:', data.transcription);
      } else {
        setTestResult('error');
        toast.error('Whisper API test failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      logger.error('Error testing Whisper API:', error);
      setTestResult('error');
      toast.error('Whisper API test failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center">
          <Headphones className="h-4 w-4 mr-2" />
          Voice Message Capability
        </CardTitle>
        <CardDescription>
          Test connection to OpenAI Whisper for voice transcription
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            {testResult === 'success' && (
              <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
            )}
            {testResult === 'error' && (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            )}
            <span className="text-sm">
              {testResult === 'success' 
                ? 'Whisper API connected successfully' 
                : testResult === 'error' 
                  ? 'Connection failed' 
                  : 'Not tested yet'}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={testWhisperAPI}
            disabled={isTesting}
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhisperAPITester;
