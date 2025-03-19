import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Save, RefreshCw } from 'lucide-react';
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
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [whatsappInstances, setWhatsappInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [existingMappings, setExistingMappings] = useState<FileMapping[]>([]);

  // Fetch WhatsApp instances and files when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch WhatsApp instances
        const {
          data: instancesData,
          error: instancesError
        } = await supabase.from('whatsapp_instances').select('*').order('instance_name');
        if (instancesError) {
          throw new Error(instancesError.message);
        }
        setWhatsappInstances(instancesData || []);

        // Set default selected instance if any exist
        if (instancesData && instancesData.length > 0) {
          setSelectedInstanceId(instancesData[0].id);
        }

        // Fetch files
        const {
          data: filesData,
          error: filesError
        } = await supabase.from('files').select('id, filename, original_name').order('created_at', {
          ascending: false
        });
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

  // Fetch existing mappings when selected instance changes
  useEffect(() => {
    const fetchMappings = async () => {
      if (!selectedInstanceId) return;
      try {
        const {
          data,
          error
        } = await supabase.from('whatsapp_file_mappings').select('*').eq('whatsapp_instance_id', selectedInstanceId);
        if (error) {
          throw new Error(error.message);
        }
        setExistingMappings(data || []);

        // Update selected file IDs based on mappings
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
      // Delete existing mappings for this instance
      const {
        error: deleteError
      } = await supabase.from('whatsapp_file_mappings').delete().eq('whatsapp_instance_id', selectedInstanceId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      // Only proceed with insertions if there are files selected
      if (selectedFileIds.size > 0) {
        // Create new mappings
        const mappingsToInsert = Array.from(selectedFileIds).map(fileId => ({
          whatsapp_instance_id: selectedInstanceId,
          file_id: fileId,
          user_id: user.id
        }));
        const {
          error: insertError
        } = await supabase.from('whatsapp_file_mappings').insert(mappingsToInsert);
        if (insertError) {
          throw new Error(insertError.message);
        }
      }
      toast({
        title: 'Success',
        description: 'File mappings saved successfully'
      });
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
      const {
        data,
        error
      } = await supabase.from('whatsapp_file_mappings').select('*').eq('whatsapp_instance_id', selectedInstanceId);
      if (error) {
        throw new Error(error.message);
      }
      setExistingMappings(data || []);

      // Update selected file IDs based on mappings
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
  return <div className="container mx-auto py-8 px-[16px]">
      <h1 className="text-2xl font-bold mb-6">WhatsApp File Configuration</h1>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Select WhatsApp Instance</CardTitle>
          <CardDescription>Choose which WhatsApp number you want to configure</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2">Loading instances...</span>
            </div> : whatsappInstances.length === 0 ? <p className="text-muted-foreground">No WhatsApp instances found. Please create a WhatsApp connection first.</p> : <div className="grid gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="instance-select">WhatsApp Instance</Label>
                <Select value={selectedInstanceId || ''} onValueChange={handleInstanceChange}>
                  <SelectTrigger id="instance-select">
                    <SelectValue placeholder="Select an instance" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {whatsappInstances.map(instance => <SelectItem key={instance.id} value={instance.id}>
                        {instance.instance_name} ({instance.status})
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>}
        </CardContent>
      </Card>

      {selectedInstanceId && <Card>
          <CardHeader>
            <CardTitle>Select Files</CardTitle>
            <CardDescription>Choose which files should be used for this WhatsApp instance</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2">Loading files...</span>
              </div> : files.length === 0 ? <p className="text-muted-foreground">No files found. Please upload files first.</p> : <div className="grid gap-4">
                <div className="border rounded-md p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">Available Files</h3>
                    <Button variant="outline" size="sm" onClick={refreshData} className="flex items-center gap-1">
                      <RefreshCw className="h-4 w-4" />
                      <span>Refresh</span>
                    </Button>
                  </div>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {files.map(file => <div key={file.id} className="flex items-start space-x-2">
                        <Checkbox id={`file-${file.id}`} checked={selectedFileIds.has(file.id)} onCheckedChange={() => handleFileToggle(file.id)} />
                        <Label htmlFor={`file-${file.id}`} className="text-sm font-normal cursor-pointer flex-1">
                          {file.original_name || file.filename}
                        </Label>
                      </div>)}
                  </div>
                </div>
              </div>}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              <span className="text-sm text-muted-foreground">
                {selectedFileIds.size} file(s) selected
              </span>
            </div>
            <Button onClick={handleSave} disabled={isLoading || isSaving || !selectedInstanceId} className="flex items-center gap-1">
              {isSaving ? <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </> : <>
                  <Save className="h-4 w-4" />
                  <span>Save Configuration</span>
                </>}
            </Button>
          </CardFooter>
        </Card>}
    </div>;
};
export default WhatsAppFileConfig;