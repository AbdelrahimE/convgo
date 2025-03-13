
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const WebhookEndpointInfo = () => {
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  
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
    <Card>
      <CardHeader>
        <CardTitle>Webhook Endpoint Information</CardTitle>
        <CardDescription>
          Use these endpoints to configure your EVOLUTION API webhooks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Webhook Configuration Help</AlertTitle>
          <AlertDescription>
            When testing or configuring your webhook, make sure to use the correct endpoint format.
            You can send webhook messages directly to the callback endpoint for testing.
          </AlertDescription>
        </Alert>
        
        <Tabs defaultValue="endpoints" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
            <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          </TabsList>
          
          <TabsContent value="endpoints" className="space-y-4">
            <div className="space-y-2">
              <Label>Main Webhook Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input 
                  value={webhookEndpoint} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => copyToClipboard(webhookEndpoint)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                For general webhook management and registration with EVOLUTION API
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Direct Callback Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input 
                  value={webhookCallbackEndpoint} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => copyToClipboard(webhookCallbackEndpoint)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this URL in EVOLUTION API to receive webhook callbacks
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="testing" className="space-y-4">
            <p className="text-sm">
              You can test your webhook by sending a POST request with the following format to either endpoint:
            </p>
            
            <div className="bg-muted p-3 rounded-md">
              <pre className="text-xs overflow-x-auto">{jsonExample}</pre>
            </div>
            
            <p className="text-sm">
              Make sure to set the Content-Type header to <code className="bg-muted px-1 py-0.5 rounded">application/json</code>
            </p>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Testing Tools</AlertTitle>
              <AlertDescription>
                Use tools like Postman or curl to send test requests to your webhook endpoints.
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs"
                    onClick={() => window.open("https://www.postman.com", "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open Postman
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="troubleshooting" className="space-y-4">
            <h4 className="font-medium">Common Issues</h4>
            
            <div className="space-y-4">
              <div>
                <h5 className="font-medium text-sm">"Invalid action" Error</h5>
                <p className="text-sm text-muted-foreground">
                  If you get an "Invalid action" error, make sure:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground ml-4 mt-1">
                  <li>Your JSON has the correct format with "event" and "instance" fields</li>
                  <li>You're sending to the correct endpoint (main or callback)</li>
                  <li>Your Content-Type header is set to application/json</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-sm">No Messages Appearing</h5>
                <p className="text-sm text-muted-foreground">
                  If webhook messages don't show up in the monitor:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground ml-4 mt-1">
                  <li>Check the webhook registration status in EVOLUTION API</li>
                  <li>Verify that your instance name matches exactly what's configured</li>
                  <li>Check if your WhatsApp instance is properly connected</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-sm">Authorization Issues</h5>
                <p className="text-sm text-muted-foreground">
                  If EVOLUTION API can't connect to your webhook:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground ml-4 mt-1">
                  <li>Ensure your URL is publicly accessible</li>
                  <li>Check if any authorization headers are required</li>
                  <li>Verify EVOLUTION API is properly configured with your API key</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button 
          variant="outline"
          onClick={() => window.open("https://doc.evolution-api.com/v2/api-reference/set-webhook", "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          EVOLUTION API Webhook Docs
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WebhookEndpointInfo;
