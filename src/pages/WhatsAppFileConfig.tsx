import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Save, RefreshCw, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface File {
  id: string;
  filename: string;
  original_name: string;
}

interface FileMapping {
  id: string;
  file_id: string;
  whatsapp_instance_id: string;
}

const WhatsAppFileConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [whatsappInstances, setWhatsappInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [existingMappings, setExistingMappings] = useState<FileMapping[]>([]);
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: instancesData, error: instancesError } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .order('instance_name');

        if (instancesError) {
          throw new Error(instancesError.message);
        }

        setWhatsappInstances(instancesData || []);

        if (instancesData && instancesData.length > 0) {
          setSelectedInstanceId(instancesData[0].id);
        }

        const { data: filesData, error: filesError } = await supabase
          .from('files')
          .select('id, filename, original_name')
          .order('created_at', { ascending: false });

        if (filesError) {
          throw new Error(filesError.message);
        }

        setFiles(filesData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load data. Please try again.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  useEffect(() => {
    const fetchMappings = async () => {
      if (!selectedInstanceId) return;

      try {
        const { data, error } = await supabase
          .from('whatsapp_file_mappings')
          .select('*')
          .eq('whatsapp_instance_id', selectedInstanceId);

        if (error) {
          throw new Error(error.message);
        }

        setExistingMappings(data || []);

        const mappedFileIds = new Set((data || []).map(mapping => mapping.file_id));
        setSelectedFileIds(mappedFileIds);
      } catch (error) {
        console.error('Error fetching mappings:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load existing file mappings.'
        });
      }
    };

    fetchMappings();
  }, [selectedInstanceId, toast]);

  const handleInstanceChange = (instanceId: string) => {
    setSelectedInstanceId(instanceId);
  };

  const handleFileToggle = (fileId: string) => {
    const newSelectedFileIds = new Set(selectedFileIds);

    if (newSelectedFileIds.has(fileId)) {
      newSelectedFileIds.delete(fileId);
    } else {
      newSelectedFileIds.add(fileId);
    }

    setSelectedFileIds(newSelectedFileIds);
  };

  const handleSave = async () => {
    if (!selectedInstanceId || !user) return;

    setIsSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from('whatsapp_file_mappings')
        .delete()
        .eq('whatsapp_instance_id', selectedInstanceId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (selectedFileIds.size > 0) {
        const mappingsToInsert = Array.from(selectedFileIds).map(fileId => ({
          whatsapp_instance_id: selectedInstanceId,
          file_id: fileId,
          user_id: user.id
        }));

        const { error: insertError } = await supabase
          .from('whatsapp_file_mappings')
          .insert(mappingsToInsert);

        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      setSaveSuccess(true);
      toast({
        title: 'Success',
        description: 'File mappings saved successfully'
      });

      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error saving mappings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save file mappings. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshData = async () => {
    if (!selectedInstanceId) return;

    try {
      const { data, error } = await supabase
        .from('whatsapp_file_mappings')
        .select('*')
        .eq('whatsapp_instance_id', selectedInstanceId);

      if (error) {
        throw new Error(error.message);
      }

      setExistingMappings(data || []);

      const mappedFileIds = new Set((data || []).map(mapping => mapping.file_id));
      setSelectedFileIds(mappedFileIds);

      toast({
        title: 'Refreshed',
        description: 'File mappings refreshed successfully'
      });
    } catch (error) {
      console.error('Error refreshing mappings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to refresh file mappings.'
      });
    }
  };

  const getInstanceStatus = (instance?: WhatsAppInstance) => {
    if (!instance) return 'disconnected';
    return instance.status.toLowerCase() === 'connected' ? 'connected' : 'disconnected';
  };

  const selectedInstance = whatsappInstances.find(instance => instance.id === selectedInstanceId);
  const connectionStatus = getInstanceStatus(selectedInstance);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto px-4 py-8"
    >
      <div className="space-y-8">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-left md:text-3xl lg:text-4xl"
        >
          File Configuration
        </motion.h1>
        
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>Select WhatsApp Instance</CardTitle>
                  <CardDescription className="my-[6px] text-left">Choose which WhatsApp number you want to configure</CardDescription>
                </div>
                
                {selectedInstanceId && (
                  <div className="flex flex-row items-center gap-2 shrink-0 min-w-max">
                    <div className={cn(
                      "relative flex items-center justify-center rounded-full h-8 w-8", 
                      connectionStatus === 'connected' 
                        ? "bg-green-100 dark:bg-green-900/30" 
                        : "bg-red-100 dark:bg-red-900/30"
                    )}>
                      {connectionStatus === 'connected' ? (
                        <>
                          <Wifi className="h-4 w-4 text-green-600 dark:text-green-500" />
                          <span className="absolute inset-0 rounded-full bg-green-400/40 dark:bg-green-600/40 animate-pulse"></span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-4 w-4 text-red-600 dark:text-red-500" />
                          <span className="absolute inset-0 rounded-full bg-red-400/40 dark:bg-red-600/40 animate-pulse"></span>
                        </>
                      )}
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">
                      {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Loading instances...</span>
                  </div>
                ) : whatsappInstances.length === 0 ? (
                  <p className="text-muted-foreground">No WhatsApp instances found. Please create a WhatsApp connection first.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="instance-select">WhatsApp Instance</Label>
                      <Select value={selectedInstanceId || ''} onValueChange={handleInstanceChange}>
                        <SelectTrigger id="instance-select">
                          <SelectValue placeholder="Select an instance" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {whatsappInstances.map(instance => (
                            <SelectItem key={instance.id} value={instance.id}>
                              {instance.instance_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {selectedInstanceId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Select Files</CardTitle>
                  <CardDescription>
                    Select the files that the AI will use to respond to inquiries received on the specified WhatsApp number. 
                    Any files not selected here will be ignored.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="ml-2">Loading files...</span>
                    </div>
                  ) : files.length === 0 ? (
                    <p className="text-muted-foreground">No files found. Please upload files first.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="border rounded-md p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium">Available Files</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={refreshData}
                            className="flex items-center gap-1 transition hover:scale-105 active:scale-95"
                          >
                            <RefreshCw className="h-4 w-4" />
                            <span>Refresh</span>
                          </Button>
                        </div>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                          {files.map(file => (
                            <motion.div
                              key={file.id}
                              whileHover={{ scale: 1.01 }}
                              onMouseEnter={() => setHoveredFileId(file.id)}
                              onMouseLeave={() => setHoveredFileId(null)}
                              className={cn(
                                "flex items-start space-x-2 p-2 rounded-md border border-transparent transition-all duration-200",
                                hoveredFileId === file.id && "border-border bg-accent/30 shadow-sm"
                              )}
                            >
                              <Checkbox
                                id={`file-${file.id}`}
                                checked={selectedFileIds.has(file.id)}
                                onCheckedChange={() => handleFileToggle(file.id)}
                              />
                              <Label
                                htmlFor={`file-${file.id}`}
                                className="text-sm font-normal cursor-pointer flex-1"
                              >
                                {file.original_name || file.filename}
                              </Label>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div>
                    <span className="text-sm text-muted-foreground">
                      {selectedFileIds.size} file(s) selected
                    </span>
                  </div>
                  <motion.div whileTap={{ scale: 0.95 }}>
                    <Button
                      onClick={handleSave}
                      disabled={isLoading || isSaving || !selectedInstanceId}
                      className="flex items-center gap-1"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : saveSuccess ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span>Saved!</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          <span>Save Configuration</span>
                        </>
                      )}
                    </Button>
                  </motion.div>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default WhatsAppFileConfig;
