
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Webhook Endpoint Information</CardTitle>
        <CardDescription>
          Set up the webhook endpoint in your EVOLUTION API server to receive and process WhatsApp messages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            Configure your EVOLUTION API server to send webhook events to this URL. All incoming messages will be automatically processed by the AI assistant.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <div className="flex gap-2">
            <Input 
              id="webhook-url" 
              value={webhookEndpoint} 
              readOnly 
              className="flex-1 font-mono text-sm"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => copyToClipboard(webhookEndpoint)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this URL in your EVOLUTION API webhook configuration
          </p>
        </div>
        
        <Tabs defaultValue="setup" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="setup">Setup Instructions</TabsTrigger>
            <TabsTrigger value="example">Example Payload</TabsTrigger>
          </TabsList>
          <TabsContent value="setup" className="space-y-4 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-base font-medium">Setting up your webhook in EVOLUTION API</h3>
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  <li>In your EVOLUTION API configuration, find the webhook settings section</li>
                  <li>Set the Webhook URL to the endpoint shown above</li>
                  <li>Enable events for <code className="text-xs bg-muted px-1 py-0.5 rounded">messages.upsert</code> to receive incoming messages</li>
                  <li>Restart your EVOLUTION API server to apply the changes</li>
                </ol>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-base font-medium">Using the EVOLUTION API REST endpoint</h3>
                <p className="text-sm text-muted-foreground">
                  If you're using the REST API, you can set the webhook URL with the following request:
                </p>
                <pre className="p-2 bg-muted rounded text-xs overflow-x-auto">
{`POST /api/{instance-name}/webhook
Content-Type: application/json
apikey: your-evolution-api-key

{
  "url": "${webhookEndpoint}"
}`}
                </pre>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="example" className="pt-4">
            <div className="space-y-2">
              <h3 className="text-base font-medium">Example message webhook payload</h3>
              <p className="text-sm text-muted-foreground">
                This is an example of the payload structure sent by EVOLUTION API:
              </p>
              <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                {jsonExample}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          <a 
            href="https://doc.evolution-api.com/v2/api-reference/webhook-configuration" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View EVOLUTION API webhook documentation
          </a>
        </div>
      </CardFooter>
    </Card>
  );
};

export default WebhookEndpointInfo;
