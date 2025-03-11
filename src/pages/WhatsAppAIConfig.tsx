
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsItem, TabsList } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Send,
  Bot,
  FileText,
  Power,
  PowerOff,
  Copy,
  RefreshCw,
  HelpCircle,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface File {
  id: string;
  filename: string;
  original_name: string;
  primary_language?: string;
  size_bytes: number;
}

interface FileMapping {
  id?: string;
  whatsapp_instance_id: string;
  file_id: string;
}

interface AIConfig {
  id?: string;
  whatsapp_instance_id: string;
  system_prompt: string;
  is_active: boolean;
  temperature: number;
}

interface TestMessage {
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

const WhatsAppAIConfig = () => {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('');
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [isLoadingResponse, setIsLoadingResponse] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  // Fetch WhatsApp instances
  const { 
    data: instances,
    isLoading: isLoadingInstances,
    error: instancesError
  } = useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'CONNECTED');
      
      if (error) throw error;
      return data as WhatsAppInstance[];
    },
    enabled: !!user
  });

  // Fetch files
  const { 
    data: files,
    isLoading: isLoadingFiles,
    error: filesError
  } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('files')
        .select('id, filename, original_name, primary_language, size_bytes')
        .eq('profile_id', user?.id);
      
      if (error) throw error;
      return data as File[];
    },
    enabled: !!user
  });

  // Fetch existing file mappings when instance is selected
  const {
    data: fileMappings,
    isLoading: isLoadingMappings,
    error: mappingsError,
    refetch: refetchMappings
  } = useQuery({
    queryKey: ['file-mappings', selectedInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_file_mappings')
        .select('*')
        .eq('whatsapp_instance_id', selectedInstanceId);
      
      if (error) throw error;
      return data as FileMapping[];
    },
    enabled: !!selectedInstanceId
  });

  // Fetch existing AI config when instance is selected
  const {
    data: aiConfig,
    isLoading: isLoadingConfig,
    error: configError,
    refetch: refetchConfig
  } = useQuery({
    queryKey: ['ai-config', selectedInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .eq('whatsapp_instance_id', selectedInstanceId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // Not found is ok
      return data as AIConfig;
    },
    enabled: !!selectedInstanceId
  });

  // Update state when instance is selected
  useEffect(() => {
    if (selectedInstanceId && fileMappings) {
      const mappedFiles: Record<string, boolean> = {};
      fileMappings.forEach(mapping => {
        mappedFiles[mapping.file_id] = true;
      });
      setSelectedFiles(mappedFiles);
    }
  }, [selectedInstanceId, fileMappings]);

  // Update system prompt when AI config is loaded
  useEffect(() => {
    if (aiConfig) {
      setSystemPrompt(aiConfig.system_prompt);
    } else {
      setSystemPrompt('You are a helpful WhatsApp assistant. Provide accurate and concise information based on the context provided. If you do not know the answer, say so.');
    }
  }, [aiConfig]);

  // Handle instance selection
  const handleInstanceChange = (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setMessages([]);
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  // Save file mappings and AI config
  const handleSaveConfig = async () => {
    if (!selectedInstanceId) {
      toast.error('Please select a WhatsApp instance');
      return;
    }

    if (!systemPrompt.trim()) {
      toast.error('System prompt is required');
      return;
    }

    try {
      setIsSaving(true);

      // Get the current list of file mappings
      const { data: existingMappings, error: fetchError } = await supabase
        .from('whatsapp_file_mappings')
        .select('id, file_id')
        .eq('whatsapp_instance_id', selectedInstanceId);

      if (fetchError) throw fetchError;

      // Determine which mappings to delete
      const mappingsToDelete = existingMappings
        ?.filter(mapping => !selectedFiles[mapping.file_id])
        .map(mapping => mapping.id) || [];

      // Delete removed mappings
      if (mappingsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('whatsapp_file_mappings')
          .delete()
          .in('id', mappingsToDelete);

        if (deleteError) throw deleteError;
      }

      // Determine which files to add
      const existingFileIds = new Set(existingMappings?.map(m => m.file_id) || []);
      const filesToAdd = Object.entries(selectedFiles)
        .filter(([fileId, isSelected]) => isSelected && !existingFileIds.has(fileId))
        .map(([fileId]) => ({
          user_id: user?.id,
          whatsapp_instance_id: selectedInstanceId,
          file_id: fileId
        }));

      // Add new mappings
      if (filesToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('whatsapp_file_mappings')
          .insert(filesToAdd);

        if (insertError) throw insertError;
      }

      // Update or create AI config
      const configData = {
        user_id: user?.id,
        whatsapp_instance_id: selectedInstanceId,
        system_prompt: systemPrompt,
        temperature: 1.0, // Fixed as per requirements
      };

      if (aiConfig?.id) {
        // Update existing config
        const { error: updateError } = await supabase
          .from('whatsapp_ai_config')
          .update(configData)
          .eq('id', aiConfig.id);

        if (updateError) throw updateError;
      } else {
        // Create new config
        const { error: insertError } = await supabase
          .from('whatsapp_ai_config')
          .insert(configData);

        if (insertError) throw insertError;
      }

      // Refresh data
      refetchMappings();
      refetchConfig();
      queryClient.invalidateQueries({ queryKey: ['file-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['ai-config'] });

      toast.success('Configuration saved successfully');
    } catch (error: any) {
      console.error('Error saving configuration:', error);
      toast.error(`Failed to save configuration: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Send a test message
  const handleSendTestMessage = async () => {
    if (!testMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (!selectedInstanceId) {
      toast.error('Please select a WhatsApp instance');
      return;
    }

    try {
      setIsLoadingResponse(true);
      
      // Add user message to chat
      const userMessage: TestMessage = {
        content: testMessage,
        role: 'user',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage]);
      setTestMessage('');

      // Get selected file IDs
      const fileIds = Object.entries(selectedFiles)
        .filter(([_, isSelected]) => isSelected)
        .map(([fileId]) => fileId);

      if (fileIds.length === 0) {
        setMessages(prev => [
          ...prev, 
          {
            content: "I don't have any documents to search through. Please select some files for me to use.",
            role: 'assistant',
            timestamp: new Date()
          }
        ]);
        return;
      }

      // Perform semantic search
      const { data: searchData, error: searchError } = await supabase.functions.invoke('semantic-search', {
        body: {
          query: userMessage.content,
          limit: 5,
          threshold: 0.7,
          fileIds: fileIds
        }
      });

      if (searchError) throw searchError;

      // If no relevant content found
      if (!searchData.results || searchData.results.length === 0) {
        setMessages(prev => [
          ...prev, 
          {
            content: "I couldn't find any relevant information to answer your question.",
            role: 'assistant',
            timestamp: new Date()
          }
        ]);
        return;
      }

      // Assemble context from search results
      const context = searchData.results
        .map((result: any) => result.content)
        .join('\n\n');

      // Generate AI response
      const { data: responseData, error: responseError } = await supabase.functions.invoke('generate-response', {
        body: {
          query: userMessage.content,
          context: context,
          systemPrompt: systemPrompt,
          temperature: 1.0,
          model: 'gpt-4o-mini'
        }
      });

      if (responseError) throw responseError;

      // Add AI response to chat
      setMessages(prev => [
        ...prev, 
        {
          content: responseData.answer,
          role: 'assistant',
          timestamp: new Date()
        }
      ]);

    } catch (error: any) {
      console.error('Error sending test message:', error);
      toast.error(`Error: ${error.message}`);
      
      setMessages(prev => [
        ...prev, 
        {
          content: `Sorry, an error occurred: ${error.message}`,
          role: 'assistant',
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoadingResponse(false);
    }
  };

  // Toggle AI activation
  const toggleAIActivation = async () => {
    if (!selectedInstanceId || !aiConfig) {
      toast.error('Please select a WhatsApp instance and save configuration first');
      return;
    }

    try {
      setIsSaving(true);

      // Get the instance name
      const instance = instances?.find(inst => inst.id === selectedInstanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      // Call the webhook setup function
      const { data, error } = await supabase.functions.invoke('whatsapp-setup-webhook', {
        body: {
          instanceName: instance.instance_name,
          enabled: !aiConfig.is_active
        }
      });

      if (error) throw error;

      // Refresh AI config
      refetchConfig();
      queryClient.invalidateQueries({ queryKey: ['ai-config'] });

      toast.success(`AI ${!aiConfig.is_active ? 'activated' : 'deactivated'} successfully`);
    } catch (error: any) {
      console.error('Error toggling AI activation:', error);
      toast.error(`Failed to ${!aiConfig?.is_active ? 'activate' : 'deactivate'} AI: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Copy default prompt to clipboard
  const copyDefaultPrompt = () => {
    const defaultPrompt = 'You are a helpful WhatsApp assistant. Provide accurate and concise information based on the context provided. If you do not know the answer, say so.';
    navigator.clipboard.writeText(defaultPrompt);
    setSystemPrompt(defaultPrompt);
    toast.success('Default prompt copied and applied');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (authLoading || isLoadingInstances) {
    return (
      <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6 flex justify-center items-center min-h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <p>Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              Please log in to access WhatsApp AI configuration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-7xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
            WhatsApp AI Configuration
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Configure your AI assistant for WhatsApp
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select WhatsApp Instance</CardTitle>
            <CardDescription>
              Choose which WhatsApp number you want to configure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="instance">WhatsApp Instance</Label>
                <Select 
                  value={selectedInstanceId} 
                  onValueChange={handleInstanceChange}
                >
                  <SelectTrigger id="instance">
                    <SelectValue placeholder="Select WhatsApp instance" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances && instances.length > 0 ? (
                      instances.map(instance => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.instance_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        No connected instances available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {instances && instances.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    You need to connect a WhatsApp instance first. Go to the{" "}
                    <Button variant="link" className="h-auto p-0" onClick={() => window.location.href = '/whatsapp'}>
                      WhatsApp Linking
                    </Button>{" "}
                    page to set up a new instance.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedInstanceId && (
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsItem value="files">Document Selection</TabsItem>
              <TabsItem value="prompt">System Prompt</TabsItem>
              <TabsItem value="test">Test Assistant</TabsItem>
            </TabsList>
            <TabsContent value="files">
              <Card>
                <CardHeader>
                  <CardTitle>Select Documents</CardTitle>
                  <CardDescription>
                    Choose which documents to use for answering WhatsApp queries
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingFiles || isLoadingMappings ? (
                    <div className="flex justify-center items-center min-h-[200px]">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <p>Loading documents...</p>
                    </div>
                  ) : files && files.length > 0 ? (
                    <ScrollArea className="h-[300px] rounded-md border p-2">
                      <div className="space-y-4">
                        {files.map(file => (
                          <div key={file.id} className="flex items-start space-x-3 py-2">
                            <Checkbox 
                              id={file.id} 
                              checked={!!selectedFiles[file.id]} 
                              onCheckedChange={() => toggleFileSelection(file.id)}
                            />
                            <div className="flex-1 space-y-1">
                              <Label 
                                htmlFor={file.id} 
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {file.original_name}
                              </Label>
                              <div className="flex items-center text-xs text-muted-foreground">
                                <FileText className="h-3 w-3 mr-1" />
                                <span>{formatSize(file.size_bytes)}</span>
                                {file.primary_language && (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{file.primary_language}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="bg-muted/40 rounded-lg p-6 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <h3 className="text-lg font-medium">No documents found</h3>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">
                        Upload some documents first to use them with your WhatsApp AI assistant
                      </p>
                      <Button variant="secondary" onClick={() => window.location.href = '/files'}>
                        Go to File Management
                      </Button>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <HelpCircle className="h-4 w-4 mr-1" />
                            <span>
                              {Object.values(selectedFiles).filter(Boolean).length} documents selected
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Only selected documents will be searched when answering queries</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Button onClick={handleSaveConfig} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Selection'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            <TabsContent value="prompt">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>System Prompt</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={copyDefaultPrompt}
                      className="h-8"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Use Default
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Define how your AI assistant should respond to WhatsApp messages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="systemPrompt">System Prompt</Label>
                      <Textarea
                        id="systemPrompt"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={6}
                        placeholder="You are a helpful assistant..."
                        className="resize-y"
                      />
                      <p className="text-sm text-muted-foreground">
                        This prompt guides how the AI responds to messages.
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveConfig} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Prompt'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            <TabsContent value="test">
              <Card>
                <CardHeader>
                  <CardTitle>Test Your AI Assistant</CardTitle>
                  <CardDescription>
                    Try out your assistant before activating it
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/30 rounded-lg h-[300px] mb-4 p-4 overflow-y-auto">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Bot className="h-12 w-12 mb-2" />
                        <p>Send a message to test your AI assistant</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex",
                              msg.role === 'user' ? "justify-end" : "justify-start"
                            )}
                          >
                            <div 
                              className={cn(
                                "rounded-lg px-4 py-2 max-w-[80%]",
                                msg.role === 'user' 
                                  ? "bg-primary text-primary-foreground" 
                                  : "bg-muted"
                              )}
                            >
                              <p className="text-sm">{msg.content}</p>
                              <p className="text-xs opacity-70 mt-1 text-right">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a test message..."
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isLoadingResponse) {
                          e.preventDefault();
                          handleSendTestMessage();
                        }
                      }}
                      disabled={isLoadingResponse}
                    />
                    <Button 
                      onClick={handleSendTestMessage} 
                      disabled={isLoadingResponse || !testMessage.trim()}
                    >
                      {isLoadingResponse ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <div className="w-full">
                    <Alert 
                      variant={aiConfig?.is_active ? "green" : "orange"}
                      icon={aiConfig?.is_active ? Check : HelpCircle}
                    >
                      {aiConfig?.is_active 
                        ? "AI assistant is currently active and responding to WhatsApp messages" 
                        : "AI assistant is not active. Activate it to start responding to WhatsApp messages"
                      }
                    </Alert>
                  </div>
                  <div className="flex justify-between w-full">
                    <Button 
                      variant="outline" 
                      onClick={handleSaveConfig}
                      disabled={isSaving}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Save Config
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant={aiConfig?.is_active ? "destructive" : "default"}
                          disabled={isSaving || !aiConfig}
                        >
                          {aiConfig?.is_active ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Deactivate AI
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Activate AI
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {aiConfig?.is_active ? "Deactivate AI Assistant?" : "Activate AI Assistant?"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {aiConfig?.is_active 
                              ? "The AI will stop responding to messages on this WhatsApp number."
                              : "The AI will start responding to all messages on this WhatsApp number using the selected documents and system prompt."
                            }
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={toggleAIActivation}
                            className={aiConfig?.is_active ? "bg-destructive hover:bg-destructive/90" : ""}
                          >
                            {aiConfig?.is_active ? "Deactivate" : "Activate"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

// Custom Alert component
const Alert = ({ 
  children, 
  variant = "default", 
  icon: Icon 
}: { 
  children: React.ReactNode; 
  variant?: "default" | "green" | "orange"; 
  icon?: React.ComponentType<{ className?: string }>;
}) => {
  const variantClassNames = {
    default: "bg-muted text-foreground",
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
  };

  return (
    <div className={cn(
      "flex items-center p-3 rounded-md text-sm",
      variantClassNames[variant]
    )}>
      {Icon && <Icon className="h-5 w-5 mr-2 flex-shrink-0" />}
      <div>{children}</div>
    </div>
  );
};

export default WhatsAppAIConfig;
