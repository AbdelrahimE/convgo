
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Headphones, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase.functions.invoke('whatsapp-voice-transcribe', {
        body: {
          audioUrl: testAudioUrl,
          mimeType: 'audio/mpeg', // Proper MIME type for MP3
        }
      });

      if (error) {
        console.error('Error testing Whisper API:', error);
        setTestResult('error');
        toast.error('Whisper API test failed: ' + error.message);
        return;
      }

      if (data.success) {
        setTestResult('success');
        toast.success('Successfully connected to OpenAI Whisper API');
        console.log('Transcription result:', data.transcription);
      } else {
        setTestResult('error');
        toast.error('Whisper API test failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error testing Whisper API:', error);
      setTestResult('error');
      toast.error('Whisper API test failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Headphones className="mr-2 h-6 w-6 text-blue-500" />
          Voice Message Transcription Status
        </CardTitle>
        <CardDescription>
          Test if the OpenAI Whisper API is configured correctly for voice message transcription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Voice message transcription allows your WhatsApp AI to understand voice messages sent by users.
          Click the button below to test if the integration is working properly.
        </p>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {testResult === 'success' && (
              <div className="flex items-center text-green-600">
                <CheckCircle2 className="mr-2 h-5 w-5" />
                <span>Whisper API is working correctly</span>
              </div>
            )}
            {testResult === 'error' && (
              <div className="flex items-center text-red-600">
                <AlertCircle className="mr-2 h-5 w-5" />
                <span>Failed to connect to Whisper API</span>
              </div>
            )}
          </div>
          
          <Button 
            onClick={testWhisperAPI} 
            disabled={isTesting}
            className="flex items-center gap-2"
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Headphones className="h-4 w-4" />
                Test Whisper API
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhisperAPITester;
