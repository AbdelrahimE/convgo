
import { useCallback, useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { FileList } from '@/components/FileList';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function FileManagement() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const { data: files, isLoading, refetch } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const onUploadSuccess = useCallback(() => {
    toast({
      title: 'Success',
      description: 'File uploaded successfully',
    });
    refetch();
  }, [refetch, toast]);

  const onUploadError = useCallback((error: Error) => {
    toast({
      title: 'Error',
      description: error.message,
      variant: 'destructive',
    });
  }, [toast]);

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-center md:text-left">File Management</h1>
      
      <div className="grid gap-8 md:grid-cols-[350px,1fr] lg:grid-cols-[400px,1fr]">
        <div className="space-y-4">
          <FileUploader 
            onUploadStart={() => setIsUploading(true)}
            onUploadEnd={() => setIsUploading(false)}
            onSuccess={onUploadSuccess}
            onError={onUploadError}
          />
          
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="font-medium mb-2">Allowed file types:</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>PDF (*.pdf)</li>
              <li>Word (*.docx)</li>
              <li>Text (*.txt)</li>
              <li>CSV (*.csv)</li>
              <li>Excel (*.xlsx)</li>
            </ul>
            <div className="mt-4 text-sm text-muted-foreground">
              Maximum file size: 10MB
            </div>
          </div>
        </div>

        <div className="relative min-h-[400px]">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <FileList 
              files={files || []}
              isUploading={isUploading}
              onDeleteSuccess={() => refetch()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
