
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle>WhatsApp Webhook Configuration</CardTitle>
        <CardDescription>
          Configure your EVOLUTION API server to send webhook events to this endpoint
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="webhook-url">Your Webhook URL</Label>
          <div className="flex mt-1.5">
            <Input
              id="webhook-url"
              value={webhookEndpoint}
              readOnly
              className="flex-1 font-mono text-sm bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              className="ml-2"
              onClick={() => copyToClipboard(webhookEndpoint)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            This is the single webhook endpoint that will receive all events from your EVOLUTION API server.
          </p>
        </div>

        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>EVOLUTION API Webhook Setup</AlertTitle>
          <AlertDescription>
            <p className="mb-2">The EVOLUTION API server uses a single webhook for all WhatsApp instances. All events (incoming and outgoing messages) from all connected WhatsApp numbers are sent to this endpoint.</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <span className="font-medium">Important:</span> Your webhook URL should be set exactly as shown above. Do not add any extra path segments.
              </p>
              <p>
                <span className="font-medium">Key points:</span>
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>The system automatically extracts the instance name from the webhook payload</li>
                <li>Messages from different WhatsApp numbers will be properly routed to the correct AI instance</li>
                <li>Group messages (containing @g.us) and self-sent messages are automatically filtered</li>
                <li>Only messages from individual users that aren't sent by the bot will receive AI responses</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        <div>
          <h3 className="text-sm font-medium mb-2">Setup Instructions</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>
              <span className="font-medium">Configure webhook in EVOLUTION API:</span>
              <p className="text-muted-foreground mt-0.5">
                Go to your EVOLUTION API instance settings and set the webhook URL to the endpoint above.
              </p>
            </li>
            <li>
              <span className="font-medium">Set the webhook global URL:</span>
              <p className="text-muted-foreground mt-0.5">
                Configure the <code className="bg-muted px-1 rounded">webhook.global.url</code> setting in your EVOLUTION API configuration to point to our webhook URL.
              </p>
            </li>
            <li>
              <span className="font-medium">Enable webhook events:</span>
              <p className="text-muted-foreground mt-0.5">
                Make sure webhook events are enabled for message receipt (<code className="bg-muted px-1 rounded">messages.upsert</code> events).
              </p>
            </li>
          </ol>
        </div>

        <Tabs defaultValue="example" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="example">Example Payload</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          </TabsList>
          <TabsContent value="example" className="mt-4">
            <div className="bg-muted rounded-md p-4 overflow-auto max-h-96">
              <pre className="text-xs whitespace-pre-wrap font-mono">{jsonExample}</pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This is an example of a webhook payload sent by EVOLUTION API when a message is received.
              Notice that the <code className="bg-muted px-1 rounded">instance</code> field identifies which WhatsApp number received the message.
            </p>
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm">
                The EVOLUTION API documentation provides comprehensive details on webhook events and configuration options.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a 
                  href="https://doc.evolution-api.com/v2/api-reference/get-information" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View EVOLUTION API Documentation
                </a>
              </Button>
              <div className="mt-2 text-sm space-y-2">
                <p className="font-medium">Important webhook parameters:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><code className="bg-muted px-1 rounded">instance</code>: Identifies which WhatsApp number received the message</li>
                  <li><code className="bg-muted px-1 rounded">data.key.remoteJid</code>: Contains the sender's number with suffix (@s.whatsapp.net for individual or @g.us for group)</li>
                  <li><code className="bg-muted px-1 rounded">data.message.conversation</code>: Contains the actual message content</li>
                  <li><code className="bg-muted px-1 rounded">data.key.fromMe</code>: Indicates if the message was sent by the bot</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="bg-muted/50 p-3 text-xs text-muted-foreground">
        <div className="flex items-start">
          <Info className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
          <p>
            Our system automatically processes incoming webhook events, extracts the required information, and uses AI to generate appropriate responses based on the configured system prompts and knowledge base.
          </p>
        </div>
      </CardFooter>
    </Card>
  );
};

export default WebhookEndpointInfo;
