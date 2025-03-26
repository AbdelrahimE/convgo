
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Save, Phone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Schema for support config
const supportConfigSchema = z.object({
  support_phone_number: z.string()
    .min(1, "Support phone number is required")
    .regex(/^\+?[0-9]+$/, "Phone number can only contain numbers and an optional '+' prefix"),
  notification_message: z.string()
    .min(10, "Notification message must be at least 10 characters")
    .max(500, "Notification message must be less than 500 characters")
});

// Schema for keywords
const keywordSchema = z.object({
  keyword: z.string().min(1, "Keyword is required").max(50, "Keyword must be less than 50 characters"),
  category: z.string().optional(),
  is_active: z.boolean().default(true)
});

interface WhatsAppSupportConfigProps {
  instanceId: string;
  instanceName: string;
}

const WhatsAppSupportConfig = ({ instanceId, instanceName }: WhatsAppSupportConfigProps) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Array<any>>([]);
  const [newKeyword, setNewKeyword] = useState({ keyword: '', category: '', is_active: true });
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);
  const [isSavingKeyword, setIsSavingKeyword] = useState(false);

  const form = useForm<z.infer<typeof supportConfigSchema>>({
    resolver: zodResolver(supportConfigSchema),
    defaultValues: {
      support_phone_number: '',
      notification_message: 'A customer needs support. Please check your WhatsApp Support dashboard.'
    }
  });

  // Load existing support configuration
  useEffect(() => {
    if (instanceId && user) {
      loadSupportConfig();
      loadKeywords();
    }
  }, [instanceId, user]);

  const loadSupportConfig = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_support_config')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .eq('user_id', user?.id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found error
          console.error('Error loading support config:', error);
        }
      } else if (data) {
        form.reset({
          support_phone_number: data.support_phone_number || '',
          notification_message: data.notification_message || 'A customer needs support. Please check your WhatsApp Support dashboard.'
        });
        setConfigId(data.id);
      }
    } catch (error) {
      console.error('Error in loadSupportConfig:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadKeywords = async () => {
    try {
      setIsLoadingKeywords(true);
      const { data, error } = await supabase
        .from('whatsapp_support_keywords')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading keywords:', error);
        toast.error('Failed to load support keywords');
      } else {
        setKeywords(data || []);
      }
    } catch (error) {
      console.error('Error in loadKeywords:', error);
    } finally {
      setIsLoadingKeywords(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof supportConfigSchema>) => {
    if (!instanceId || !user?.id) {
      toast.error('Missing instance ID or user ID');
      return;
    }

    try {
      setIsSaving(true);
      
      if (configId) {
        // Update existing config
        const { error } = await supabase
          .from('whatsapp_support_config')
          .update({
            support_phone_number: values.support_phone_number,
            notification_message: values.notification_message,
            updated_at: new Date().toISOString()
          })
          .eq('id', configId);

        if (error) throw error;
      } else {
        // Create new config
        const { data, error } = await supabase
          .from('whatsapp_support_config')
          .insert({
            whatsapp_instance_id: instanceId,
            user_id: user?.id,
            support_phone_number: values.support_phone_number,
            notification_message: values.notification_message
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setConfigId(data.id);
      }

      toast.success('Support configuration saved successfully');
    } catch (error) {
      console.error('Error saving support config:', error);
      toast.error('Failed to save support configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.keyword.trim()) {
      toast.error('Keyword is required');
      return;
    }

    try {
      setIsSavingKeyword(true);
      
      const { data, error } = await supabase
        .from('whatsapp_support_keywords')
        .insert({
          keyword: newKeyword.keyword.trim(),
          category: newKeyword.category.trim() || null,
          is_active: newKeyword.is_active,
          user_id: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      
      setKeywords(prev => [data, ...prev]);
      setNewKeyword({ keyword: '', category: '', is_active: true });
      toast.success('Keyword added successfully');
    } catch (error) {
      console.error('Error adding keyword:', error);
      toast.error('Failed to add keyword');
    } finally {
      setIsSavingKeyword(false);
    }
  };

  const handleToggleKeyword = async (id: string, isCurrentlyActive: boolean) => {
    try {
      const { error } = await supabase
        .from('whatsapp_support_keywords')
        .update({ is_active: !isCurrentlyActive })
        .eq('id', id);

      if (error) throw error;
      
      setKeywords(prev => 
        prev.map(kw => kw.id === id ? { ...kw, is_active: !isCurrentlyActive } : kw)
      );
      
      toast.success(`Keyword ${isCurrentlyActive ? 'disabled' : 'enabled'}`);
    } catch (error) {
      console.error('Error toggling keyword:', error);
      toast.error('Failed to update keyword');
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_support_keywords')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setKeywords(prev => prev.filter(kw => kw.id !== id));
      toast.success('Keyword deleted successfully');
    } catch (error) {
      console.error('Error deleting keyword:', error);
      toast.error('Failed to delete keyword');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Support Configuration</CardTitle>
          <CardDescription>
            Configure which phone number should receive escalated support requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="support_phone_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Support WhatsApp Number</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                          <Input {...field} placeholder="+1234567890" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notification_message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notification Message</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Enter the message to send to support when a conversation is escalated"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={isSaving} className="w-full">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Configuration
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Support Keywords</CardTitle>
          <CardDescription>
            Define keywords that will automatically escalate a conversation to support
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-muted rounded-md">
            <h3 className="text-sm font-medium mb-2">Add New Keyword</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="keyword">Keyword</Label>
                <Input
                  id="keyword"
                  value={newKeyword.keyword}
                  onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                  placeholder="e.g., help, urgent, support"
                />
              </div>
              <div>
                <Label htmlFor="category">Category (optional)</Label>
                <Input
                  id="category"
                  value={newKeyword.category}
                  onChange={(e) => setNewKeyword({ ...newKeyword, category: e.target.value })}
                  placeholder="e.g., complaint, technical"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddKeyword} disabled={isSavingKeyword} className="w-full">
                  {isSavingKeyword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Keyword
                </Button>
              </div>
            </div>
          </div>

          {isLoadingKeywords ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : keywords.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No keywords added yet. Keywords help automatically identify when a customer needs support.
            </p>
          ) : (
            <div className="space-y-2">
              {keywords.map((keyword) => (
                <div key={keyword.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="flex items-center gap-2">
                    <Badge variant={keyword.is_active ? "default" : "outline"}>
                      {keyword.keyword}
                    </Badge>
                    {keyword.category && (
                      <span className="text-xs text-muted-foreground">
                        {keyword.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={keyword.is_active}
                      onCheckedChange={() => handleToggleKeyword(keyword.id, keyword.is_active)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteKeyword(keyword.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppSupportConfig;
