
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
  const { user } = useAuth();

  // Simplified webhook URL - no instance name in the path
  const baseUrl = 'https://okoaoguvtjauiecfajri.supabase.co/functions/v1/whatsapp-webhook';
  const webhookEndpoint = `${baseUrl}`;
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Webhook URL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  
  const jsonExample = `{
  "event": "messages.upsert",
  "instance": "201018090321",
  "data": {
    "key": {
      "remoteJid": "201098169094@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB088477E47519157CDB3"
    },
    "pushName": "WABotMaster",
    "status": "DELIVERY_ACK",
    "message": {
      "conversation": "السلام عليكم"
    },
    "messageType": "conversation",
    "messageTimestamp": 1741984444,
    "instanceId": "6e0f302f-2ad3-4dd1-aab4-1f2324255c54",
    "source": "web"
  },
  "destination": "YOUR_WEBHOOK_URL",
  "date_time": "2025-03-14T21:34:05.210Z",
  "sender": "201018090321@s.whatsapp.net",
  "server_url": "https://api.convgo.com",
  "apikey": "YOUR_API_KEY"
}`;

  // Adding the return statement with JSX
  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Configuration</CardTitle>
        <CardDescription>
          Configure the EVOLUTION API to send webhook events to this URL
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            You must configure your EVOLUTION API instance to send webhook events to this URL.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Your Webhook URL</Label>
          <div className="flex items-center gap-2">
            <Input 
              id="webhook-url" 
              value={webhookEndpoint} 
              readOnly 
              className="font-mono text-sm"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => copyToClipboard(webhookEndpoint)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="example">
          <TabsList>
            <TabsTrigger value="example">Example Payload</TabsTrigger>
            <TabsTrigger value="instructions">Setup Instructions</TabsTrigger>
          </TabsList>
          <TabsContent value="example">
            <div className="bg-muted p-4 rounded-md">
              <pre className="text-xs overflow-auto whitespace-pre-wrap">{jsonExample}</pre>
            </div>
          </TabsContent>
          <TabsContent value="instructions">
            <div className="space-y-4">
              <h3 className="font-medium">Setting up Webhooks in EVOLUTION API</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Open your EVOLUTION API configuration</li>
                <li>Navigate to the Webhook settings section</li>
                <li>Enter the webhook URL shown above</li>
                <li>Enable the webhook events you want to receive (at minimum, enable "messages.upsert")</li>
                <li>Save your configuration</li>
              </ol>
              <div className="pt-2">
                <a 
                  href="https://doc.evolution-api.com/v2/api-reference/get-information" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  EVOLUTION API Documentation
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default WebhookEndpointInfo;
