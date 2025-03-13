
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
            When configuring your webhook in EVOLUTION API, you only need to provide the URL - 
            <strong className="text-blue-800"> no authorization headers or special configuration is required</strong>. 
            The endpoint accepts all content types and formats automatically.
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
              <Label>Main Webhook URL for EVOLUTION API</Label>
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
                This is the URL you should enter in the EVOLUTION API webhook configuration. 
                <strong> No authorization headers are required</strong> and the endpoint accepts all content types.
              </p>
            </div>
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>How to Configure in EVOLUTION API</AlertTitle>
              <AlertDescription>
                <ol className="list-decimal ml-4 space-y-2 mt-2">
                  <li>Go to your EVOLUTION API admin panel</li>
                  <li>Find your instance settings</li>
                  <li>Look for the webhook configuration section</li>
                  <li>Paste the URL above into the webhook field</li>
                  <li>Make sure to select the events you want to receive (messages.upsert, connection.update, etc.)</li>
                  <li>Save your configuration</li>
                  <li className="font-medium text-blue-700">No additional headers or auth configuration is needed</li>
                </ol>
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="testing" className="space-y-4">
            <p className="text-sm">
              You can test your webhook by sending a POST request with the following format using tools like Postman:
            </p>
            
            <div className="bg-muted p-3 rounded-md">
              <pre className="text-xs overflow-x-auto">{jsonExample}</pre>
            </div>
            
            <div className="space-y-2">
              <h5 className="font-medium">Important Headers for Testing:</h5>
              <div className="bg-muted p-3 rounded-md">
                <p className="text-xs font-mono">Content-Type: application/json</p>
              </div>
              <p className="text-xs text-muted-foreground">
                When manually testing with Postman or similar tools, make sure to set the Content-Type header.
                <br />
                When using the EVOLUTION API, you don't need to set any headers - just provide the webhook URL.
              </p>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Note About Testing vs. Real Usage</AlertTitle>
              <AlertDescription>
                When testing with tools like Postman, you need to set the Content-Type header manually.
                <br /><br />
                When using the EVOLUTION API, you only need to provide the URL - the server automatically
                handles the headers and message format.
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="troubleshooting" className="space-y-4">
            <h4 className="font-medium">Common Issues</h4>
            
            <div className="space-y-4">
              <div>
                <h5 className="font-medium text-sm">No Messages Appearing</h5>
                <p className="text-sm text-muted-foreground">
                  If webhook messages don't show up in the monitor:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground ml-4 mt-1">
                  <li>Check that the webhook URL is correctly entered in EVOLUTION API</li>
                  <li>Verify that the instance name matches exactly what's configured</li>
                  <li>Ensure that your WhatsApp instance is properly connected</li>
                  <li>Check that you've selected the correct events to receive (messages.upsert, etc.)</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-sm">Connection Issues</h5>
                <p className="text-sm text-muted-foreground">
                  If EVOLUTION API reports connection issues:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground ml-4 mt-1">
                  <li>Check your internet connection</li>
                  <li>Verify that the webhook URL is accessible from the server</li>
                  <li>Make sure there are no firewall rules blocking the connection</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-sm">Webhook Format Issues</h5>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      View Server Logs Format
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h6 className="text-sm font-medium">Server Logs Format</h6>
                      <p className="text-xs">The webhook URL is sent without additional headers in the EVOLUTION API logs:</p>
                      <div className="bg-black text-green-400 p-2 rounded text-xs font-mono">
                        local: 'ChannelStartupService.sendData-Webhook-Global',<br />
                        url: 'https://okoaoguvtjauiecfajri.supabase.co/functions/v1/whatsapp-webhook',<br />
                        event: 'messages.upsert',<br />
                        instance: '201018090094',
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-sm text-muted-foreground mt-2">
                  The EVOLUTION API server automatically formats the webhook requests correctly.
                  You don't need to configure any headers or authentication when setting up the webhook URL.
                </p>
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
