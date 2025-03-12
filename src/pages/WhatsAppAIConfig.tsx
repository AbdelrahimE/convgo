
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useSemanticSearch } from '@/hooks/use-semantic-search';
import { useAIResponse } from '@/hooks/use-ai-response';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Loader2, Lightbulb } from 'lucide-react';

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
}

const WhatsAppAIConfig = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { search } = useSemanticSearch();
  const { generateResponse, isGenerating, responseResult } = useAIResponse();

  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');
  
  // Test conversation
  const [testQuery, setTestQuery] = useState('');
  const [conversation, setConversation] = useState<{role: string, content: string}[]>([]);

  // Prompt generator state
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [userDescription, setUserDescription] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

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
    }
  }, [selectedInstance]);

  const loadWhatsAppInstances = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id);

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
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .eq('whatsapp_instance_id', selectedInstance)
        .eq('user_id', user?.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No config found, use default
          setSystemPrompt('You are a helpful AI assistant. Answer questions based on the context provided.');
          return;
        }
        throw error;
      }
      
      setSystemPrompt(data.system_prompt || '');
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

    try {
      setIsSaving(true);
      
      // Check if config already exists
      const { data: existingConfig, error: checkError } = await supabase
        .from('whatsapp_ai_config')
        .select('id')
        .eq('whatsapp_instance_id', selectedInstance)
        .eq('user_id', user?.id)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingConfig) {
        // Update existing config
        const { error } = await supabase
          .from('whatsapp_ai_config')
          .update({
            system_prompt: systemPrompt,
            temperature: 1.0,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConfig.id);

        if (error) throw error;
      } else {
        // Create new config
        const { error } = await supabase
          .from('whatsapp_ai_config')
          .insert({
            whatsapp_instance_id: selectedInstance,
            user_id: user?.id,
            system_prompt: systemPrompt,
            temperature: 1.0,
            is_active: true
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
      
      const { data, error } = await supabase.functions.invoke('generate-system-prompt', {
        body: { description: userDescription }
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
      // Add user message to conversation
      const userMessage = { role: 'user', content: testQuery };
      setConversation(prev => [...prev, userMessage]);
      
      // Get files associated with the selected WhatsApp instance
      const { data: fileMappings, error: mappingError } = await supabase
        .from('whatsapp_file_mappings')
        .select('file_id')
        .eq('whatsapp_instance_id', selectedInstance)
        .eq('user_id', user?.id);
        
      if (mappingError) throw mappingError;
      
      if (!fileMappings || fileMappings.length === 0) {
        toast.error('No files associated with this WhatsApp instance');
        setConversation(prev => [...prev, { role: 'assistant', content: 'Error: No files are configured for this WhatsApp number. Please associate files with this number in the WhatsApp File Configuration page.' }]);
        return;
      }
      
      // Search for relevant content
      const fileIds = fileMappings.map(mapping => mapping.file_id);
      const results = await search({ 
        query: testQuery,
        fileIds: fileIds,
        limit: 5
      });
      
      if (results.length === 0) {
        setConversation(prev => [...prev, { role: 'assistant', content: 'I could not find relevant information in the associated files to answer your question.' }]);
        return;
      }
      
      // Prepare context from search results
      const context = results.map(result => result.content).join('\n\n');
      
      // Generate AI response
      const response = await generateResponse(testQuery, context, {
        systemPrompt,
        temperature: 1.0
      });
      
      if (response) {
        setConversation(prev => [...prev, { role: 'assistant', content: response.answer }]);
      } else {
        setConversation(prev => [...prev, { role: 'assistant', content: 'Sorry, I was unable to generate a response at this time.' }]);
      }

      // Clear the input
      setTestQuery('');
      
    } catch (error) {
      console.error('Error sending test message:', error);
      toast.error('Failed to send test message');
      setConversation(prev => [...prev, { role: 'assistant', content: 'Error: Failed to process your message.' }]);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">WhatsApp AI Configuration</h1>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-1/3">
          <Label htmlFor="whatsapp-instance">WhatsApp Number</Label>
          <select
            id="whatsapp-instance"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedInstance}
            onChange={(e) => setSelectedInstance(e.target.value)}
            disabled={isLoading || instances.length === 0}
          >
            {instances.length === 0 ? (
              <option value="">No WhatsApp numbers available</option>
            ) : (
              instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.instance_name} ({instance.status})
                </option>
              ))
            )}
          </select>
        </div>
        
        <div className="flex-1">
          {!selectedInstance ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Please select a WhatsApp instance to configure AI settings
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="test">Test ChatBot</TabsTrigger>
              </TabsList>
              
              <TabsContent value="config" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>AI System Prompt</CardTitle>
                    <CardDescription>
                      Define how the AI assistant should respond to WhatsApp messages
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="system-prompt">System Prompt</Label>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={generateSystemPrompt}
                          disabled={isLoading || !selectedInstance}
                        >
                          <Lightbulb className="mr-2 h-4 w-4" />
                          Auto-Generate Prompt
                        </Button>
                      </div>
                      <Textarea
                        id="system-prompt"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={8}
                        placeholder="Provide instructions for how the AI should respond to messages..."
                        className="resize-y"
                      />
                    </div>
                    
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground">Temperature: 1.0 (fixed)</span>
                    </div>
                    
                    <Button 
                      onClick={saveAIConfig} 
                      disabled={isSaving || !systemPrompt.trim() || !selectedInstance}
                      className="w-full"
                    >
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="test">
                <Card>
                  <CardHeader>
                    <CardTitle>Test Your ChatBot</CardTitle>
                    <CardDescription>
                      Send test messages to see how your AI will respond using the configured files
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-secondary/50 rounded-lg p-4 h-80 overflow-y-auto mb-4 flex flex-col gap-2">
                      {conversation.length === 0 ? (
                        <p className="text-center text-muted-foreground p-4">
                          Send a message to start the conversation
                        </p>
                      ) : (
                        conversation.map((msg, index) => (
                          <div 
                            key={index}
                            className={`max-w-[80%] px-4 py-2 rounded-lg ${
                              msg.role === 'user' 
                                ? 'bg-primary text-primary-foreground self-end' 
                                : 'bg-muted self-start'
                            }`}
                          >
                            {msg.content}
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        value={testQuery}
                        onChange={(e) => setTestQuery(e.target.value)}
                        placeholder="Type a message to test..."
                        onKeyDown={(e) => e.key === 'Enter' && sendTestMessage()}
                      />
                      <Button 
                        onClick={sendTestMessage}
                        disabled={isGenerating || !testQuery.trim() || !selectedInstance}
                      >
                        {isGenerating ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Prompt Generator Dialog */}
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
              <Textarea
                id="description"
                placeholder="Example: I need an AI assistant that can answer customer questions about our product return policy in a friendly but professional tone."
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
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
            <Button
              variant="outline"
              onClick={() => setPromptDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateSystemPrompt}
              disabled={isGeneratingPrompt || !userDescription.trim()}
            >
              {isGeneratingPrompt ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Generating...
                </>
              ) : (
                'Generate Prompt'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppAIConfig;
