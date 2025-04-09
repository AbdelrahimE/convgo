import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageAwareInput } from '@/components/ui/language-aware-input';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Tags, X, MessageSquare, Phone, Save, Trash2 } from 'lucide-react';
import { EscalatedConversations } from '@/components/EscalatedConversations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import logger from '@/utils/logger';
const WhatsAppSupportConfig = () => {
  const {
    user
  } = useAuth();
  const [instances, setInstances] = useState<Array<{
    id: string;
    instance_name: string;
    status: string;
  }>>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [supportPhoneNumber, setSupportPhoneNumber] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('A customer needs support. Please check your WhatsApp Support dashboard.');
  const [escalationMessage, setEscalationMessage] = useState('Thank you for your message. A support representative will get back to you as soon as possible.');
  const [keywords, setKeywords] = useState<Array<{
    id: string;
    keyword: string;
    category: string | null;
  }>>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
    }
  }, [user]);
  useEffect(() => {
    if (selectedInstance) {
      loadSupportConfig();
      loadKeywords();
    } else {
      setSupportPhoneNumber('');
      setNotificationMessage('A customer needs support. Please check your WhatsApp Support dashboard.');
      setEscalationMessage('Thank you for your message. A support representative will get back to you as soon as possible.');
      setKeywords([]);
    }
  }, [selectedInstance]);
  const loadWhatsAppInstances = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_instances').select('id, instance_name, status').eq('user_id', user?.id);
      if (error) throw error;
      setInstances(data || []);
      if (data && data.length > 0) {
        setSelectedInstance(data[0].id);
      }
    } catch (error) {
      logger.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    } finally {
      setIsLoading(false);
    }
  };
  const loadSupportConfig = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_support_config').select('*').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (error) {
        if (error.code === 'PGRST116') {
          // No config found, use defaults
          setSupportPhoneNumber('');
          setNotificationMessage('A customer needs support. Please check your WhatsApp Support dashboard.');
          setEscalationMessage('Thank you for your message. A support representative will get back to you as soon as possible.');
          return;
        }
        throw error;
      }
      setSupportPhoneNumber(data.support_phone_number || '');
      setNotificationMessage(data.notification_message || 'A customer needs support. Please check your WhatsApp Support dashboard.');
      setEscalationMessage(data.escalation_message || 'Thank you for your message. A support representative will get back to you as soon as possible.');
    } catch (error) {
      logger.error('Error loading support config:', error);
      toast.error('Failed to load support configuration');
    } finally {
      setIsLoading(false);
    }
  };
  const loadKeywords = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_support_keywords').select('id, keyword, category').eq('user_id', user?.id).eq('whatsapp_instance_id', selectedInstance).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setKeywords(data || []);
    } catch (error) {
      logger.error('Error loading keywords:', error);
      toast.error('Failed to load support keywords');
    } finally {
      setIsLoading(false);
    }
  };
  const saveSupportConfig = async () => {
    if (!selectedInstance) {
      toast.error('Please select a WhatsApp instance');
      return;
    }
    if (!supportPhoneNumber) {
      toast.error('Please provide a support WhatsApp number');
      return;
    }
    try {
      setIsSaving(true);
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_support_config').select('id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_support_config').update({
          support_phone_number: supportPhoneNumber,
          notification_message: notificationMessage,
          escalation_message: escalationMessage,
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const {
          error
        } = await supabase.from('whatsapp_support_config').insert({
          whatsapp_instance_id: selectedInstance,
          user_id: user?.id,
          support_phone_number: supportPhoneNumber,
          notification_message: notificationMessage,
          escalation_message: escalationMessage
        });
        if (error) throw error;
      }
      toast.success('Support configuration saved successfully');
    } catch (error) {
      logger.error('Error saving support config:', error);
      toast.error('Failed to save support configuration');
    } finally {
      setIsSaving(false);
    }
  };
  const addKeyword = async () => {
    if (!newKeyword.trim()) {
      toast.error('Please enter a keyword');
      return;
    }
    if (!selectedInstance) {
      toast.error('Please select a WhatsApp instance');
      return;
    }
    try {
      setIsAddingKeyword(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_support_keywords').insert({
        user_id: user?.id,
        whatsapp_instance_id: selectedInstance,
        keyword: newKeyword.trim(),
        category: newCategory.trim() || null
      }).select().single();
      if (error) throw error;
      setKeywords([data, ...keywords]);
      setNewKeyword('');
      setNewCategory('');
      toast.success('Keyword added successfully');
    } catch (error) {
      logger.error('Error adding keyword:', error);
      toast.error('Failed to add keyword');
    } finally {
      setIsAddingKeyword(false);
    }
  };
  const deleteKeyword = async (id: string) => {
    try {
      const {
        error
      } = await supabase.from('whatsapp_support_keywords').delete().eq('id', id).eq('user_id', user?.id);
      if (error) throw error;
      setKeywords(keywords.filter(keyword => keyword.id !== id));
      toast.success('Keyword removed successfully');
    } catch (error) {
      logger.error('Error deleting keyword:', error);
      toast.error('Failed to delete keyword');
    }
  };
  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.3
  }} className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-8">
        <motion.h1 initial={{
        opacity: 0,
        x: -20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        delay: 0.2
      }} className="text-2xl text-left md:text-3xl font-extrabold lg:text-4xl">
          Support Configuration
        </motion.h1>
        
        <div className="grid gap-8">
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.3
        }}>
            <div className="w-full mb-4">
              <Label htmlFor="whatsapp-instance">Choose WhatsApp Number</Label>
              <select id="whatsapp-instance" value={selectedInstance} onChange={e => setSelectedInstance(e.target.value)} disabled={isLoading || instances.length === 0} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 my-[8px]">
                {instances.length === 0 ? <option value="">No WhatsApp numbers available</option> : instances.map(instance => <option key={instance.id} value={instance.id}>
                      {instance.instance_name} ({instance.status})
                    </option>)}
              </select>
            </div>
            
            <div className="w-full">
              {!selectedInstance ? <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      Please select a WhatsApp instance to configure support settings
                    </p>
                  </CardContent>
                </Card> : <div className="space-y-6">
                  <Tabs defaultValue="settings" className="space-y-6">
                    <TabsList>
                      <TabsTrigger value="settings">Settings</TabsTrigger>
                      <TabsTrigger value="keywords">Keywords</TabsTrigger>
                      <TabsTrigger value="escalated">Escalated Conversations</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="settings">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center font-bold">
                            <Phone className="h-5 w-5 mr-2" />
                            Support Contact Settings
                          </CardTitle>
                          <CardDescription>
                            Configure the phone number that will receive support requests
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="support-phone">Support WhatsApp Number</Label>
                            <LanguageAwareInput id="support-phone" placeholder="e.g. +1234567890 (with country code)" value={supportPhoneNumber} onChange={e => setSupportPhoneNumber(e.target.value)} />
                            <p className="flex items-center text-amber-600 text-xs text-left">Enter the phone number, without prefix ( + ) or spaces, that will receive notifications when a customer needs support.</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="notification-message">Support Notification Message</Label>
                            <LanguageAwareTextarea id="notification-message" placeholder="Message to send to support agents" value={notificationMessage} onChange={e => setNotificationMessage(e.target.value)} rows={3} />
                            <p className="flex items-center text-amber-600 text-xs text-left">Customize the message that will be sent to the support number.</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="escalation-message">Customer Escalation Message</Label>
                            <LanguageAwareTextarea id="escalation-message" placeholder="Message to send to customers when their request is escalated" value={escalationMessage} onChange={e => setEscalationMessage(e.target.value)} rows={3} />
                            <p className="flex items-center text-amber-600 text-xs text-left">Customize the message that will be sent to customers when their conversation is escalated to human support.</p>
                          </div>
                          
                          <Button onClick={saveSupportConfig} disabled={isSaving || !supportPhoneNumber} className="w-full bg-blue-700 hover:bg-blue-600">
                            {isSaving ? <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </> : <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Support Settings
                              </>}
                          </Button>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    
                    <TabsContent value="keywords">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center font-bold">
                            <Tags className="h-5 w-5 mr-2" />
                            Support Keywords
                          </CardTitle>
                          <CardDescription>
                            Manage keywords that will trigger automatic support escalation for this WhatsApp number
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-4 mb-6">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <div className="flex-1">
                                <Label htmlFor="new-keyword">New Keyword</Label>
                                <LanguageAwareInput id="new-keyword" placeholder="e.g. help, urgent, support" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} disabled={!selectedInstance} />
                              </div>
                              <div className="flex-1">
                                <Label htmlFor="new-category">Category (Optional)</Label>
                                <LanguageAwareInput id="new-category" placeholder="e.g. billing, technical" value={newCategory} onChange={e => setNewCategory(e.target.value)} disabled={!selectedInstance} />
                              </div>
                              <div className="flex items-end">
                                <Button onClick={addKeyword} disabled={isAddingKeyword || !newKeyword.trim() || !selectedInstance} className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600">
                                  {isAddingKeyword ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                                      <Plus className="h-4 w-4 mr-2" />
                                      Add
                                    </>}
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <h3 className="text-sm font-medium mb-2">Current Keywords for this WhatsApp Number</h3>
                            {keywords.length === 0 ? <p className="text-sm text-muted-foreground py-4">
                                No keywords added yet for this WhatsApp number. Keywords help identify when a customer message should be escalated to human support.
                              </p> : <div className="flex flex-wrap gap-2">
                                {keywords.map(keyword => <div key={keyword.id} className="flex items-center bg-muted px-3 py-1 rounded-full">
                                    <span className="text-sm font-medium mr-1">{keyword.keyword}</span>
                                    {keyword.category && <Badge variant="outline" className="mr-1 h-5">
                                        {keyword.category}
                                      </Badge>}
                                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full" onClick={() => deleteKeyword(keyword.id)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>)}
                              </div>}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    
                    <TabsContent value="escalated">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center font-bold">
                            <MessageSquare className="h-5 w-5 mr-2" />
                            Escalated Conversations
                          </CardTitle>
                          <CardDescription>
                            View and manage conversations that have been escalated to human support
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <EscalatedConversations instanceId={selectedInstance} />
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>;
};
export default WhatsAppSupportConfig;