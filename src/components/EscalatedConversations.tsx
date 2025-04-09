
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckSquare, PhoneCall, Clock, Trash2, UserPlus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import logger from '@/utils/logger';

interface EscalatedConversation {
  id: string;
  user_phone: string;
  whatsapp_instance_id: string;
  escalated_at: string;
  is_resolved: boolean;
  resolved_at: string | null;
  instance_name?: string;
}

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface EscalatedConversationsProps {
  instanceId?: string;
}

// Form validation schema
const formSchema = z.object({
  phone: z
    .string()
    .min(6, { message: "Phone number must be at least 6 characters" })
    .refine((val) => /^\+?[0-9]+$/.test(val), {
      message: "Phone number must contain only digits (with optional + prefix)",
    }),
  instanceId: z.string().uuid({ message: "Please select a WhatsApp instance" }),
});

export const EscalatedConversations = ({
  instanceId
}: EscalatedConversationsProps) => {
  const {
    user
  } = useAuth();
  const [conversations, setConversations] = useState<EscalatedConversation[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isAddingNumber, setIsAddingNumber] = useState(false);

  // Initialize form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "",
      instanceId: instanceId || "",
    },
  });

  useEffect(() => {
    if (user) {
      loadEscalatedConversations();
      if (!instanceId) {
        loadWhatsAppInstances();
      }
    }
  }, [user, instanceId]);

  useEffect(() => {
    // Update form default value when instanceId prop changes
    if (instanceId) {
      form.setValue("instanceId", instanceId);
    }
  }, [instanceId, form]);

  const loadWhatsAppInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id);
      
      if (error) throw error;
      setInstances(data || []);
    } catch (error) {
      logger.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    }
  };

  const loadEscalatedConversations = async () => {
    try {
      setIsLoading(true);
      let query = supabase.from('whatsapp_escalated_conversations').select(`
          *,
          whatsapp_instances!inner(instance_name)
        `).order('escalated_at', {
        ascending: false
      });

      if (instanceId) {
        query = query.eq('whatsapp_instance_id', instanceId);
      }

      const {
        data,
        error
      } = await query;
      if (error) throw error;

      const formattedData = data.map(item => ({
        ...item,
        instance_name: item.whatsapp_instances?.instance_name
      }));
      setConversations(formattedData || []);
    } catch (error) {
      logger.error('Error loading escalated conversations:', error);
      toast.error('Failed to load escalated conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const markAsResolved = async (id: string) => {
    try {
      setIsResolving(prev => ({
        ...prev,
        [id]: true
      }));
      const {
        error
      } = await supabase.from('whatsapp_escalated_conversations').update({
        is_resolved: true,
        resolved_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      toast.success('Conversation marked as resolved');

      setConversations(prev => prev.map(conv => conv.id === id ? {
        ...conv,
        is_resolved: true,
        resolved_at: new Date().toISOString()
      } : conv));
    } catch (error) {
      logger.error('Error resolving conversation:', error);
      toast.error('Failed to resolve conversation');
    } finally {
      setIsResolving(prev => ({
        ...prev,
        [id]: false
      }));
    }
  };

  const confirmDelete = (id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const deleteEscalation = async () => {
    if (!conversationToDelete) return;
    const id = conversationToDelete;
    try {
      setIsDeleting(prev => ({
        ...prev,
        [id]: true
      }));
      const {
        error
      } = await supabase.from('whatsapp_escalated_conversations').delete().eq('id', id);
      if (error) throw error;
      toast.success('Conversation deleted successfully');

      setConversations(prev => prev.filter(conv => conv.id !== id));
    } catch (error) {
      logger.error('Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setIsDeleting(prev => ({
        ...prev,
        [id]: false
      }));
      setConversationToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const addManualEscalation = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsAddingNumber(true);
      
      // Format phone number to ensure it has a + prefix if missing
      const formattedPhone = values.phone.startsWith('+') 
        ? values.phone 
        : `+${values.phone}`;
      
      // Check if this phone number is already escalated for this instance
      const { data: existingData, error: checkError } = await supabase
        .from('whatsapp_escalated_conversations')
        .select('id')
        .eq('whatsapp_instance_id', values.instanceId)
        .eq('user_phone', formattedPhone)
        .eq('is_resolved', false);
      
      if (checkError) throw checkError;
      
      if (existingData && existingData.length > 0) {
        toast.error('This phone number is already escalated for the selected WhatsApp instance');
        return;
      }
      
      // Insert the new escalation
      const { data, error } = await supabase
        .from('whatsapp_escalated_conversations')
        .insert({
          user_phone: formattedPhone,
          whatsapp_instance_id: values.instanceId,
          is_resolved: false
        })
        .select(`
          *,
          whatsapp_instances!inner(instance_name)
        `)
        .single();
      
      if (error) throw error;
      
      toast.success('Phone number added to escalation list');
      
      // Add the new escalation to the list with the instance name
      const newEscalation: EscalatedConversation = {
        ...data,
        instance_name: data.whatsapp_instances?.instance_name
      };
      
      setConversations(prev => [newEscalation, ...prev]);
      
      // Reset the form
      form.reset({ phone: "", instanceId: instanceId || "" });
    } catch (error) {
      logger.error('Error adding manual escalation:', error);
      toast.error('Failed to add phone number to escalation list');
    } finally {
      setIsAddingNumber(false);
    }
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  };

  if (isLoading) {
    return <div className="flex justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }

  return <div className="space-y-6">
      {/* Add Manual Escalation Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Number to Escalation List
          </CardTitle>
          <CardDescription>
            Manually add a phone number to the escalated conversations list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(addManualEscalation)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="+1234567890" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the phone number with country code
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {!instanceId && (
                  <FormField
                    control={form.control}
                    name="instanceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp Instance</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            {...field}
                          >
                            <option value="">Select an instance</option>
                            {instances.map((instance) => (
                              <option key={instance.id} value={instance.id}>
                                {instance.instance_name} ({instance.status})
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              
              <div className="flex items-center">
                <Button 
                  type="submit" 
                  className="bg-blue-700 hover:bg-blue-600"
                  disabled={isAddingNumber}
                >
                  {isAddingNumber ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add to Escalation List
                    </>
                  )}
                </Button>
                
                <div className="ml-4 text-sm text-muted-foreground flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
                  Numbers added here will be excluded from AI responses
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Escalated Conversations List */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Escalated Conversations</h3>
        
        {conversations.length === 0 ? (
          <div className="text-center p-6 text-muted-foreground">
            <p>No escalated conversations found.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {conversations.map(conversation => <Card key={conversation.id} className={conversation.is_resolved ? 'border-green-200 bg-green-50/30' : 'border-red-200'}>
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
                  <div className="flex flex-col">
                    <div className="flex items-center text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Escalated {formatDistanceToNow(new Date(conversation.escalated_at))} ago
                    </div>
                    <span className="text-xs text-muted-foreground ml-5 mt-0.5">
                      ({format(new Date(conversation.escalated_at), 'MMM d, h:mm a')})
                    </span>
                  </div>
                  
                  {conversation.is_resolved && conversation.resolved_at && <div className="flex items-center text-muted-foreground mt-1">
                      <CheckSquare className="h-3.5 w-3.5 mr-1" />
                      Resolved {formatDistanceToNow(new Date(conversation.resolved_at))} ago
                    </div>}
                </CardContent>
                <CardFooter className="flex gap-2 flex-col sm:flex-row">
                  {!conversation.is_resolved}
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => confirmDelete(conversation.id)} disabled={isDeleting[conversation.id]}>
                    {isDeleting[conversation.id] ? <>
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        Deleting...
                      </> : <>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </>}
                  </Button>
                </CardFooter>
              </Card>)}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escalated Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this escalated conversation? 
              This will completely remove it from the database and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConversationToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEscalation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};

export default EscalatedConversations;
