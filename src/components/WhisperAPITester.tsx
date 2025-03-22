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
  return;
};
export default WhisperAPITester;