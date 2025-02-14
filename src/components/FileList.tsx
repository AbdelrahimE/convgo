
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FileItem = {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  mime_type: string;
  path: string;
};

export function FileList() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch files"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, path: string) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('files')
        .remove([path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      setFiles(files.filter(file => file.id !== id));
      toast({
        title: "Success",
        description: "File deleted successfully"
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete file"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  if (isLoading) {
    return <div className="text-center py-8">Loading files...</div>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Name</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="hidden sm:table-cell">Size</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center">
                No files uploaded yet
              </TableCell>
            </TableRow>
          ) : (
            files.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">{file.filename}</TableCell>
                <TableCell className="hidden md:table-cell">{file.mime_type}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatFileSize(file.size_bytes)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(file.id, file.path)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
