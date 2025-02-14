
import { useState } from 'react';
import { Trash2, FileIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import type { Database } from '@/integrations/supabase/types';

type File = Database['public']['Tables']['files']['Row'];

interface FileListProps {
  files: File[];
  isUploading: boolean;
  onDeleteSuccess: () => void;
}

export function FileList({ files, isUploading, onDeleteSuccess }: FileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (file: File) => {
    try {
      setDeletingId(file.id);
      
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user_files')
        .remove([file.path]);
      
      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;

      onDeleteSuccess();
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (files.length === 0 && !isUploading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/10 rounded-lg">
        <FileIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-2">No files uploaded yet</h3>
        <p className="text-sm text-muted-foreground">
          Your uploaded files will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <div
          key={file.id}
          className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 overflow-hidden">
              <p className="font-medium truncate" title={file.original_name}>
                {file.original_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {(file.size_bytes / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(file)}
              disabled={deletingId === file.id}
            >
              {deletingId === file.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
