
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WebhookMessage {
  id: string;
  instance: string;
  event: string;
  data: any;
  received_at: string;
}

const WebhookMonitor = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<WebhookMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (user) {
      fetchMessages();
    }
  }, [user]);

  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('webhook_messages')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching webhook messages:', error);
      toast.error('Failed to load webhook messages');
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = async () => {
    try {
      setIsDeleting(true);
      
      const { error } = await supabase
        .from('webhook_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all messages
      
      if (error) throw error;
      
      setMessages([]);
      toast.success('Webhook message history cleared');
    } catch (error) {
      console.error('Error clearing webhook messages:', error);
      toast.error('Failed to clear webhook messages');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefresh = () => {
    fetchMessages();
    toast.success('Webhook messages refreshed');
  };

  const getEventColor = (event: string) => {
    switch (event) {
      case 'messages.upsert':
        return 'bg-green-500';
      case 'connection.update':
        return 'bg-blue-500';
      case 'qrcode.updated':
        return 'bg-purple-500';
      case 'send.message':
        return 'bg-orange-500';
      case 'call':
        return 'bg-yellow-500';
      case 'errors':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  // Filter messages based on active tab
  const filteredMessages = messages.filter(message => {
    if (activeTab === 'all') return true;
    return message.event === activeTab;
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Webhook Message Monitor</h1>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={clearMessages}
            disabled={isDeleting || messages.length === 0}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <span className="ml-2">Clear History</span>
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Webhook Messages</CardTitle>
          <CardDescription>
            View incoming messages from the EVOLUTION API server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-7">
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="messages.upsert">Messages</TabsTrigger>
              <TabsTrigger value="connection.update">Connection</TabsTrigger>
              <TabsTrigger value="qrcode.updated">QR Code</TabsTrigger>
              <TabsTrigger value="send.message">Sent</TabsTrigger>
              <TabsTrigger value="call">Calls</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="mt-0">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No webhook messages found
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {filteredMessages.map((message) => (
                      <Card key={message.id} className="border-l-4" style={{ borderLeftColor: getEventColor(message.event).replace('bg-', '') }}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <Badge className={getEventColor(message.event)}>
                                  {message.event}
                                </Badge>
                                <span className="text-sm font-medium">
                                  Instance: {message.instance}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {new Date(message.received_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-muted p-2 rounded overflow-x-auto">
                            <pre className="text-xs">{JSON.stringify(message.data, null, 2)}</pre>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebhookMonitor;
