import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { LanguageAwareInput } from '@/components/ui/language-aware-input';
import { useSimpleSearch } from '@/hooks/use-simple-search';
import { useAIResponse } from '@/hooks/use-ai-response';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Lightbulb, RotateCcw, AlertTriangle, Headphones } from 'lucide-react';
import WhatsAppAIToggle from '@/components/WhatsAppAIToggle';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface AIConfig {
  id: string;
  system_prompt: string;
  temperature: number;
  is_active: boolean;
  process_voice_messages: boolean;
  voice_message_default_response: string;
  default_voice_language: string;
}

const WhatsAppAIConfig = () => {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  const {
    search
  } = useSimpleSearch();
  const {
    generateResponse,
    cleanupTestConversations,
    isGenerating,
    responseResult
  } = useAIResponse();
  const isMobile = useIsMobile();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [processVoiceMessages, setProcessVoiceMessages] = useState(true);
  const [voiceMessageDefaultResponse, setVoiceMessageDefaultResponse] = useState("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
  const [defaultVoiceLanguage, setDefaultVoiceLanguage] = useState('ar');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');
  const [testQuery, setTestQuery] = useState('');
  const [conversation, setConversation] = useState<{
    role: string;
    content: string;
  }[]>([]);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [userDescription, setUserDescription] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [testConversationId, setTestConversationId] = useState<string | null>(null);
  const [useRealConversation, setUseRealConversation] = useState(true);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showVoiceFeature, setShowVoiceFeature] = useState(true);

  const cleanupTestConversation = useCallback(async (conversationId: string) => {
    if (!conversationId) return false;
    try {
      setIsCleaningUp(true);
      const {
        error: messagesError
      } = await supabase.from('whatsapp_conversation_messages').delete().eq('conversation_id', conversationId);
      if (messagesError) {
        console.error('Error deleting test conversation messages:', messagesError);
        return false;
      }
      const {
        error: conversationError
      } = await supabase.from('whatsapp_conversations').delete().eq('id', conversationId);
      if (conversationError) {
        console.error('Error deleting test conversation:', conversationError);
        return false;
      }
      console.log('Successfully cleaned up test conversation:', conversationId);
      return true;
    } catch (error) {
      console.error('Error cleaning up test conversation:', error);
      return false;
    } finally {
      setIsCleaningUp(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
    }
  }, [user]);

  useEffect(() => {
    if (selectedInstance) {
      loadAIConfig();
    } else {
      setSystemPrompt('');
      setProcessVoiceMessages(true);
      setVoiceMessageDefaultResponse("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
      setDefaultVoiceLanguage('ar');
    }
  }, [selectedInstance]);

  useEffect(() => {
    return () => {
      if (testConversationId && useRealConversation) {
        cleanupTestConversation(testConversationId).then(success => {
          if (success) {
            console.log('Successfully cleaned up test conversation on unmount:', testConversationId);
          }
        }).catch(err => {
          console.error('Failed to clean up test conversation on unmount:', err);
        });
      }
    };
  }, [testConversationId, useRealConversation, cleanupTestConversation]);

  useEffect(() => {
    if (activeTab === 'test' && selectedInstance && useRealConversation && !testConversationId) {
      createTestConversation();
    }
  }, [activeTab, selectedInstance, useRealConversation]);

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
      console.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIConfig = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_ai_config').select('*').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (error) {
        if (error.code === 'PGRST116') {
          setSystemPrompt('You are a helpful AI assistant. Answer questions based on the context provided.');
          setProcessVoiceMessages(true);
          setVoiceMessageDefaultResponse("I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
          setDefaultVoiceLanguage('ar');
          return;
        }
        throw error;
      }
      setSystemPrompt(data.system_prompt || '');
      setProcessVoiceMessages(data.process_voice_messages !== undefined ? data.process_voice_messages : true);
      setVoiceMessageDefaultResponse(data.voice_message_default_response || "I'm sorry, but I cannot process voice messages at the moment. Please send your question as text, and I'll be happy to assist you.");
      setDefaultVoiceLanguage(data.default_voice_language || 'ar');
    } catch (error) {
      console.error('Error loading AI config:', error);
      toast.error('Failed to load AI configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const saveAIConfig = async () => {
    if (!selectedInstance || !systemPrompt.trim()) {
      toast.error('Please select a WhatsApp instance and provide a system prompt');
      return;
    }
    if (!processVoiceMessages && !voiceMessageDefaultResponse.trim()) {
      toast.error('Please provide a default response for voice messages');
      return;
    }
    try {
      setIsSaving(true);
      const {
        data: existingConfig,
        error: checkError
      } = await supabase.from('whatsapp_ai_config').select('id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id).single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      if (existingConfig) {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').update({
          system_prompt: systemPrompt,
          temperature: 1.0,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage,
          updated_at: new Date().toISOString()
        }).eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const {
          error
        } = await supabase.from('whatsapp_ai_config').insert({
          whatsapp_instance_id: selectedInstance,
          user_id: user?.id,
          system_prompt: systemPrompt,
          temperature: 1.0,
          is_active: true,
          process_voice_messages: processVoiceMessages,
          voice_message_default_response: voiceMessageDefaultResponse,
          default_voice_language: defaultVoiceLanguage
        });
        if (error) throw error;
      }
      toast.success('AI configuration saved successfully');
    } catch (error) {
      console.error('Error saving AI config:', error);
      toast.error('Failed to save AI configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const generateSystemPrompt = async () => {
    setPromptDialogOpen(true);
  };

  const handleGenerateSystemPrompt = async () => {
    if (!userDescription.trim()) {
      toast.error('Please enter a description of what you want the AI to do');
      return;
    }
    try {
      setIsGeneratingPrompt(true);
      const {
        data,
        error
      } = await supabase.functions.invoke('generate-system-prompt', {
        body: {
          description: userDescription
        }
      });
      if (error) throw error;
      if (data.success && data.prompt) {
        setSystemPrompt(data.prompt);
        setPromptDialogOpen(false);
        setUserDescription('');
        toast.success('System prompt generated successfully');
      } else {
        throw new Error('Failed to generate system prompt');
      }
    } catch (error) {
      console.error('Error generating system prompt:', error);
      toast.error('Failed to generate system prompt. Please try again.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const createTestConversation = async () => {
    if (!selectedInstance || !useRealConversation) return;
    try {
      const cleanupResult = await cleanupTestConversations(selectedInstance);
      if (!cleanupResult.success) {
        console.warn('Warning: Could not clean up stale test conversations:', cleanupResult.error);
      } else if (cleanupResult.count > 0) {
        console.log(`Cleaned up ${cleanupResult.count} stale test conversations`);
      }
      const uniqueId = new Date().getTime().toString();
      const {
        data,
        error
      } = await supabase.from('whatsapp_conversations').insert({
        instance_id: selectedInstance,
        user_phone: `test-user-${uniqueId}`,
        status: 'active',
        conversation_data: {
          is_test: true,
          created_at: new Date().toISOString()
        }
      }).select().single();
      if (error) throw error;
      setTestConversationId(data.id);
      console.log('Created test conversation:', data.id);
      setConversation([]);
    } catch (error) {
      console.error('Error creating test conversation:', error);
      toast.error(`Error creating test conversation: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  };

  const resetTestConversation = async () => {
    if (testConversationId && useRealConversation) {
      const idToDelete = testConversationId;
      setTestConversationId(null);
      setConversation([]);
      const success = await cleanupTestConversation(idToDelete);
      if (!success) {
        toast.error('Failed to clean up test conversation. A new one will be created anyway.');
      }
      await createTestConversation();
    } else {
      setConversation([]);
    }
  };

  const sendTestMessage = async () => {
    if (!testQuery.trim()) {
      toast.error('Please enter a test message');
      return;
    }
    if (!selectedInstance) {
      toast.error('Please select a WhatsApp instance');
      return;
    }
    try {
      const userMessage = {
        role: 'user',
        content: testQuery
      };
      setConversation(prev => [...prev, userMessage]);
      if (useRealConversation && testConversationId) {
        await supabase.from('whatsapp_conversation_messages').insert({
          conversation_id: testConversationId,
          role: 'user',
          content: testQuery,
          metadata: {
            is_test: true
          }
        });
      }
      const {
        data: fileMappings,
        error: mappingError
      } = await supabase.from('whatsapp_file_mappings').select('file_id').eq('whatsapp_instance_id', selectedInstance).eq('user_id', user?.id);
      if (mappingError) throw mappingError;
      if (!fileMappings || fileMappings.length === 0) {
        toast.error('No files associated with this WhatsApp instance');
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: 'Error: No files are configured for this WhatsApp number. Please associate files with this number in the WhatsApp File Configuration page.'
        }]);
        return;
      }
      const fileIds = fileMappings.map(mapping => mapping.file_id);
      const results = await search({
        query: testQuery,
        fileIds: fileIds,
        limit: 5
      });
      let context = '';
      if (results.length > 0) {
        context = results.map(result => result.content).join('\n\n');
      } else {
        console.log('No relevant content found, proceeding with empty context');
      }
      const response = await generateResponse(testQuery, context, {
        systemPrompt,
        temperature: 1.0,
        includeConversationHistory: useRealConversation,
        conversationId: useRealConversation ? testConversationId : undefined
      });
      if (response) {
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: response.answer
        }]);
        if (!useRealConversation) {
          setTestQuery('');
          return;
        }
      } else {
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I was unable to generate a response at this time.'
        }]);
      }
      setTestQuery('');
    } catch (error) {
      console.error('Error sending test message:', error);
      toast.error('Failed to send test message');
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: 'Error: Failed to process your message.'
      }]);
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
      }} className="text-2xl font-bold text-left md:text-3xl lg:text-4xl">
        AI Configuration
      </motion.h1>
      
      <div className="space-y-6">
        <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.3
        }}>
          <Card>
            <CardHeader>
              <CardTitle>Choose WhatsApp Number</CardTitle>
              <CardDescription>
                Select the WhatsApp number you want to configure for AI responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select id="whatsapp-instance" value={selectedInstance} onChange={e => setSelectedInstance(e.target.value)} disabled={isLoading || instances.length === 0} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                {instances.length === 0 ? <option value="">No WhatsApp numbers available</option> : instances.map(instance => <option key={instance.id} value={instance.id}>
                  {instance.instance_name} ({instance.status})
                </option>)}
              </select>
            </CardContent>
          </Card>
        </motion.div>
        
        {selectedInstance && instances.length > 0 && <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.4
        }}>
            <WhatsAppAIToggle instanceId={selectedInstance} instanceName={instances.find(i => i.id === selectedInstance)?.instance_name || ''} />
          </motion.div>}
        
        <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.5
        }}>
          {!selectedInstance ? <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Please select a WhatsApp instance to configure AI settings
                </p>
              </CardContent>
            </Card> : <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="test">Test ChatBot</TabsTrigger>
              </TabsList>
              
              <TabsContent value="config" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>AI System Prompt</CardTitle>
                    <CardDescription>
                      Set instructions that guide how the AI responds to incoming WhatsApp messages.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="system-prompt">Prompt</Label>
                        <Button variant="outline" size="sm" onClick={generateSystemPrompt} disabled={isLoading || !selectedInstance}>
                          <Lightbulb className="mr-2 h-4 w-4" />
                          Auto-Generate Prompt
                        </Button>
                      </div>
                      <LanguageAwareTextarea 
                        id="system-prompt" 
                        value={systemPrompt} 
                        onChange={e => setSystemPrompt(e.target.value)} 
                        rows={8} 
                        placeholder="Provide instructions for how the AI should respond to messages..." 
                        className="resize-y" 
                      />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Voice Message Settings</CardTitle>
                    <CardDescription>
                      Set how your AI assistant handles incoming voice messages on WhatsApp
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="process-voice">Process Voice Messages</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable to let the AI transcribe and reply to incoming voice messages automatically.
                        </p>
                      </div>
                      <Switch id="process-voice" checked={processVoiceMessages} onCheckedChange={setProcessVoiceMessages} className="data-[state=checked]:bg-[#0066FF] data-[state=checked]:hover:bg-[#0066FF]/90" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="voice-language">Voice Message Language</Label>
                      <Select value={defaultVoiceLanguage} onValueChange={setDefaultVoiceLanguage}>
                        <SelectTrigger id="voice-language" className="w-full">
                          <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">Arabic</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="auto">Auto-detect</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Select the language spoken in the voice messages to improve transcription accuracy.
                      </p>
                    </div>
                    
                    {!processVoiceMessages && <div className="space-y-2">
                        <Label htmlFor="voice-default-response">
                          Default Response for Voice Messages
                        </Label>
                        <LanguageAwareTextarea 
                          id="voice-default-response" 
                          value={voiceMessageDefaultResponse} 
                          onChange={e => setVoiceMessageDefaultResponse(e.target.value)} 
                          placeholder="Message to send when a voice message is received" 
                          rows={3} 
                        />
                        <p className="text-xs text-muted-foreground">
                          This reply will be automatically sent when a customer sends a voice message and voice processing is disabled.
                        </p>
                      </div>}
                    
                    <Button onClick={saveAIConfig} disabled={isSaving || !systemPrompt.trim() || !selectedInstance || !processVoiceMessages && !voiceMessageDefaultResponse.trim()} className="w-full bg-blue-700 hover:bg-blue-600">
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="test" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Test Your ChatBot</CardTitle>
                        <CardDescription>
                          Send test messages to see how your AI will respond using the configured files
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>When enabled, the AI will remember previous messages in this conversation</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      
                      <Button variant="outline" size="sm" onClick={resetTestConversation} disabled={conversation.length === 0 || isCleaningUp}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reset Conversation
                      </Button>
                    </div>
                    
                    {useRealConversation}
                    
                    <div className="bg-secondary/50 rounded-lg p-4 h-80 overflow-y-auto mb-4 flex flex-col gap-2">
                      {conversation.length === 0 ? <p className="text-center text-muted-foreground p-4">
                          Send a message to start the conversation
                        </p> : conversation.map((msg, index) => <div key={index} className={`max-w-[80%] px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-primary text-primary-foreground self-end' : 'bg-muted self-start'}`}>
                          {msg.content}
                        </div>)}
                    </div>
                    
                    <div className="flex gap-2">
                      <LanguageAwareInput 
                        value={testQuery} 
                        onChange={e => setTestQuery(e.target.value)} 
                        placeholder="Type a message to test..." 
                        onKeyDown={e => e.key === 'Enter' && sendTestMessage()} 
                      />
                      <Button onClick={sendTestMessage} disabled={isGenerating || !testQuery.trim() || !selectedInstance} className="bg-blue-700 hover:bg-blue-600">
                        {isGenerating ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>}
        </motion.div>
      </div>
    </div>

    <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI Prompt Generator</DialogTitle>
          <DialogDescription>
            Describe what you want the AI to do in your own words, and we'll create a powerful system prompt for you.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Your Description
            </Label>
            <LanguageAwareTextarea 
              id="description" 
              placeholder="Example: I need an AI assistant that can answer customer questions about our product return policy in a friendly but professional tone." 
              value={userDescription} 
              onChange={e => setUserDescription(e.target.value)} 
              className="min-h-[120px]" 
            />
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">Example Descriptions:</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• I need an AI bot that helps customers troubleshoot technical issues with our software</p>
              <p>• I want an assistant that provides factual information about our company policies</p>
              <p>• I need a sales assistant that can answer questions about our products and pricing</p>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerateSystemPrompt} disabled={isGeneratingPrompt || !userDescription.trim()}>
            {isGeneratingPrompt ? <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                Generating...
              </> : 'Generate Prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </motion.div>;
};

export default WhatsAppAIConfig;
