
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckSquare, PhoneCall, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface EscalatedConversation {
  id: string;
  user_phone: string;
  whatsapp_instance_id: string;
  escalated_at: string;
  is_resolved: boolean;
  resolved_at: string | null;
  instance_name?: string;
}

interface EscalatedConversationsProps {
  instanceId?: string;
}

export const EscalatedConversations = ({ instanceId }: EscalatedConversationsProps) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<EscalatedConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) {
      loadEscalatedConversations();
    }
  }, [user, instanceId]);

  const loadEscalatedConversations = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('whatsapp_escalated_conversations')
        .select(`
          *,
          whatsapp_instances!inner(instance_name)
        `)
        .order('escalated_at', { ascending: false });
      
      // Filter by instance if specified
      if (instanceId) {
        query = query.eq('whatsapp_instance_id', instanceId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Format the data to include instance_name
      const formattedData = data.map(item => ({
        ...item,
        instance_name: item.whatsapp_instances?.instance_name
      }));
      
      setConversations(formattedData || []);
    } catch (error) {
      console.error('Error loading escalated conversations:', error);
      toast.error('Failed to load escalated conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const markAsResolved = async (id: string) => {
    try {
      setIsResolving(prev => ({ ...prev, [id]: true }));
      
      const { error } = await supabase
        .from('whatsapp_escalated_conversations')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success('Conversation marked as resolved');
      
      // Update the local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === id 
            ? { ...conv, is_resolved: true, resolved_at: new Date().toISOString() } 
            : conv
        )
      );
    } catch (error) {
      console.error('Error resolving conversation:', error);
      toast.error('Failed to resolve conversation');
    } finally {
      setIsResolving(prev => ({ ...prev, [id]: false }));
    }
  };

  const formatPhone = (phone: string) => {
    // Remove any non-numeric characters except the plus sign
    const cleaned = phone.replace(/[^\d+]/g, '');
    // Check if it has a plus sign, if not add it
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center p-6 text-muted-foreground">
        <p>No escalated conversations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {conversations.map(conversation => (
          <Card key={conversation.id} className={conversation.is_resolved ? 'border-green-200 bg-green-50/30' : 'border-red-200'}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base flex items-center">
                    <PhoneCall className="h-4 w-4 mr-2" />
                    {formatPhone(conversation.user_phone)}
                  </CardTitle>
                  <CardDescription>
                    Instance: {conversation.instance_name}
                  </CardDescription>
                </div>
                <Badge variant={conversation.is_resolved ? "success" : "destructive"}>
                  {conversation.is_resolved ? 'Resolved' : 'Active'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center text-muted-foreground">
                <Clock className="h-3.5 w-3.5 mr-1" />
                Escalated {formatDistanceToNow(new Date(conversation.escalated_at))} ago
                <span className="text-xs ml-1">
                  ({format(new Date(conversation.escalated_at), 'MMM d, h:mm a')})
                </span>
              </div>
              
              {conversation.is_resolved && conversation.resolved_at && (
                <div className="flex items-center text-muted-foreground mt-1">
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  Resolved {formatDistanceToNow(new Date(conversation.resolved_at))} ago
                </div>
              )}
            </CardContent>
            <CardFooter>
              {!conversation.is_resolved && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => markAsResolved(conversation.id)}
                  disabled={isResolving[conversation.id]}
                >
                  {isResolving[conversation.id] ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 mr-2" />
                      Mark as Resolved
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default EscalatedConversations;
