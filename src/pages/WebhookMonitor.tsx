
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Trash2, AlertTriangle, Info, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import WebhookEndpointInfo from '@/components/WebhookEndpointInfo';
import { DebugLogsTable } from '@/components/DebugLogsTable';
import logger from '@/utils/logger';

interface WebhookMessage {
  id: string;
  instance: string;
  event: string;
  data: any;
  received_at: string;
}

const WebhookMonitor = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showIntroAlert, setShowIntroAlert] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const { 
    data: messages = [], 
    isLoading, 
    refetch,
    error 
  } = useQuery<WebhookMessage[]>({
    queryKey: ['webhookMessages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_messages')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const eventCounts = messages.reduce((counts, message) => {
    counts[message.event] = (counts[message.event] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  const lastMessageTime = messages.length > 0 
    ? new Date(messages[0].received_at) 
    : null;
  
  const receivingStatus = lastMessageTime 
    ? (new Date().getTime() - lastMessageTime.getTime() < 5 * 60 * 1000 
      ? 'active' 
      : 'inactive') 
    : 'unknown';

  const filteredMessages = messages.filter(message => {
    if (activeTab !== 'all' && message.event !== activeTab) return false;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return message.instance.toLowerCase().includes(searchLower) || 
             message.event.toLowerCase().includes(searchLower) || 
             JSON.stringify(message.data).toLowerCase().includes(searchLower);
    }
    return true;
  });

  const clearMessages = async () => {
    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('webhook_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      refetch();
      toast.success('Webhook message history cleared');
    } catch (error) {
      logger.error('Error clearing webhook messages:', error);
      toast.error('Failed to clear webhook messages');
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadJson = () => {
    const jsonStr = JSON.stringify(messages, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `webhook-messages-${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    toast.success('Webhook messages downloaded');
  };

  const getEventColor = (event: string) => {
    const colors: Record<string, string> = {
      'messages.upsert': 'bg-green-500',
      'connection.update': 'bg-blue-500',
      'qrcode.updated': 'bg-purple-500',
      'send.message': 'bg-orange-500',
      'call': 'bg-yellow-500',
      'errors': 'bg-red-500'
    };
    return colors[event] || 'bg-gray-500';
  };

  const getEventIcon = (event: string) => {
    const icons: Record<string, JSX.Element> = {
      'messages.upsert': <span className="mr-1">💬</span>,
      'connection.update': <span className="mr-1">🔌</span>,
      'qrcode.updated': <span className="mr-1">📱</span>,
      'send.message': <span className="mr-1">📤</span>,
      'call': <span className="mr-1">📞</span>,
      'errors': <span className="mr-1">⚠️</span>
    };
    return icons[event] || <span className="mr-1">📋</span>;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Webhook Monitor</h1>
          <div className="flex items-center mt-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${receivingStatus === 'active' ? 'bg-green-500' : receivingStatus === 'inactive' ? 'bg-red-500' : 'bg-yellow-500'}`} />
            <span className="text-sm text-muted-foreground">
              {receivingStatus === 'active' ? 'Receiving webhook messages' : receivingStatus === 'inactive' ? 'No recent messages received' : 'Status unknown'}
            </span>
            {lastMessageTime && (
              <span className="text-sm text-muted-foreground ml-2">
                Last message: {lastMessageTime.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} disabled={messages.length === 0}>
            <Download className="h-4 w-4" />
            <span className="ml-2">Export</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={clearMessages} disabled={isDeleting || messages.length === 0}>
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <span className="ml-2">Clear History</span>
          </Button>
        </div>
      </div>
      
      {showIntroAlert && (
        <Alert className="bg-muted">
          <Info className="h-4 w-4" />
          <AlertTitle>Monitor Webhook Activity</AlertTitle>
          <AlertDescription>
            This page shows all webhook events received from your WhatsApp instances. 
            Use the Debug Logs tab to troubleshoot connection issues and integration problems.
          </AlertDescription>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2" 
            onClick={() => setShowIntroAlert(false)}
          >
            Dismiss
          </Button>
        </Alert>
      )}
      
      <WebhookEndpointInfo />
      
      <Tabs defaultValue="messages" className="space-y-6">
        <TabsList className="mb-4">
          <TabsTrigger value="messages">Webhook Messages</TabsTrigger>
          <TabsTrigger value="debug">Debug Logs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Messages</CardTitle>
              <CardDescription>
                View incoming messages from the EVOLUTION API server
              </CardDescription>
              <div className="mt-4">
                <Input
                  placeholder="Search messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid grid-cols-7">
                  <TabsTrigger value="all">
                    All Events
                    {messages.length > 0 && <Badge variant="secondary" className="ml-2">{messages.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="messages.upsert">
                    Messages
                    {eventCounts['messages.upsert'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['messages.upsert']}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="connection.update">
                    Connection
                    {eventCounts['connection.update'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['connection.update']}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="qrcode.updated">
                    QR Code
                    {eventCounts['qrcode.updated'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['qrcode.updated']}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="send.message">
                    Sent
                    {eventCounts['send.message'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['send.message']}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="call">
                    Calls
                    {eventCounts['call'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['call']}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="errors">
                    Errors
                    {eventCounts['errors'] > 0 && <Badge variant="secondary" className="ml-2">{eventCounts['errors']}</Badge>}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value={activeTab} className="mt-0">
                  {isLoading ? <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div> : filteredMessages.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                      {messages.length === 0 ? <div className="space-y-4">
                          <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500" />
                          <div>No webhook messages found</div>
                          <div className="text-sm max-w-lg mx-auto">
                            If you haven't received any webhook messages, make sure your webhook URL is properly configured in your WhatsApp instance settings.
                          </div>
                          <Button variant="outline" onClick={() => navigate('/whatsapp-link')}>
                            Go to WhatsApp Setup
                          </Button>
                        </div> : <div>No messages matching your filters</div>}
                    </div> : <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-4">
                        {filteredMessages.map(message => <Card key={message.id} className="border-l-4" style={{
                      borderLeftColor: getEventColor(message.event).replace('bg-', '')
                    }}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <Badge className={getEventColor(message.event)}>
                                      {getEventIcon(message.event)} {message.event}
                                    </Badge>
                                    <span className="text-sm font-medium">
                                      Instance: {message.instance}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(message.received_at).toLocaleString()}
                                  </p>
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Info className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-sm">Message Details</h4>
                                      <div className="grid grid-cols-2 gap-1 text-xs">
                                        <div className="font-medium">ID:</div>
                                        <div className="truncate">{message.id}</div>
                                        <div className="font-medium">Instance:</div>
                                        <div>{message.instance}</div>
                                        <div className="font-medium">Event Type:</div>
                                        <div>{message.event}</div>
                                        <div className="font-medium">Received:</div>
                                        <div>{new Date(message.received_at).toLocaleString()}</div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="bg-muted p-2 rounded overflow-x-auto">
                                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(message.data, null, 2)}</pre>
                              </div>
                            </CardContent>
                          </Card>)}
                      </div>
                    </ScrollArea>}
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              <div className="text-xs text-muted-foreground">
                Showing {filteredMessages.length} of {messages.length} messages
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="debug">
          <DebugLogsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WebhookMonitor;
