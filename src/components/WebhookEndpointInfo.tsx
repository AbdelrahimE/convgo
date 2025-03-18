
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

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Webhook Configuration</CardTitle>
        <CardDescription>
          Set up your EVOLUTION API to send messages to this endpoint
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              Configure your WhatsApp instance to send webhook messages to the URL below.
              This allows our system to receive and process messages from your WhatsApp accounts.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <div className="flex space-x-2">
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

          <Tabs defaultValue="setup">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="setup">Setup Guide</TabsTrigger>
              <TabsTrigger value="example">Example Data</TabsTrigger>
            </TabsList>
            
            <TabsContent value="setup" className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium">Setting up webhooks in EVOLUTION API</h3>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Go to your EVOLUTION API server admin panel</li>
                  <li>Navigate to the Instances section</li>
                  <li>Select your WhatsApp instance</li>
                  <li>Find the Webhooks configuration section</li>
                  <li>Enter the webhook URL shown above</li>
                  <li>Enable the webhook for "messages.upsert" events</li>
                  <li>Save your configuration</li>
                </ol>
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://doc.evolution-api.com/v2/api-reference/configure-webhooks" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      EVOLUTION API Documentation
                    </a>
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="example">
              <div className="space-y-2">
                <h3 className="font-medium">Example Webhook Payload</h3>
                <p className="text-sm text-muted-foreground">
                  Messages from WhatsApp will be sent to your webhook with this structure:
                </p>
                <div className="bg-muted p-2 rounded-md">
                  <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-[300px]">
                    {jsonExample}
                  </pre>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          Check the <a href="https://doc.evolution-api.com" target="_blank" rel="noopener noreferrer" className="underline">EVOLUTION API docs</a> for more details
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Info className="h-4 w-4 mr-2" />
              Webhook Tips
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-medium">Troubleshooting Tips</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Ensure your EVOLUTION API server can reach this URL</li>
                <li>Check that your instance is properly connected</li>
                <li>Verify webhook events are properly configured</li>
                <li>Test sending a message to see if it appears in the monitor</li>
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      </CardFooter>
    </Card>
  );
};

export default WebhookEndpointInfo;
