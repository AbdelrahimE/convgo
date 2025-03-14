import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
const WebhookEndpointInfo = () => {
  const [copied, setCopied] = useState(false);
  const {
    user
  } = useAuth();
  const baseUrl = 'https://okoaoguvtjauiecfajri.supabase.co/functions/v1/whatsapp-webhook';
  const webhookEndpoint = `${baseUrl}`;
  const webhookCallbackEndpoint = `${baseUrl}/webhook-callback`;
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Webhook URL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const jsonExample = `{
  "event": "messages.upsert",
  "instance": "your-instance-name",
  "data": {
    "key": {
      "remoteJid": "1234567890@s.whatsapp.net",
      "fromMe": false,
      "id": "message-id-123"
    },
    "messageType": "conversation",
    "message": {
      "conversation": "This is a test message"
    },
    "sender": {
      "id": "1234567890",
      "name": "Test User",
      "shortName": "Test"
    },
    "chat": {
      "id": "1234567890@s.whatsapp.net",
      "name": "Test Chat"
    }
  }
}`;
  return;
};
export default WebhookEndpointInfo;