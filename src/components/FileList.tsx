import { useEffect, useState } from "react";
import { Grid, List, Search, Trash2, FileText, FileImage, FileIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FileItem = {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  mime_type: string;
  path: string;
};

type ViewMode = "list" | "grid";
type SortField = "filename" | "created_at" | "size_bytes" | "mime_type";
type SortOrder = "asc" | "desc";

export function FileList() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
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
      setFilteredFiles(data || []);
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
      setFilteredFiles(filteredFiles.filter(file => file.id !== id));
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

  const handlePreview = (file: FileItem | null) => {
    if (!file) return;
    setPreviewFile(file);
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <FileIcon className="h-6 w-6" />;
    if (mimeType.startsWith('image/')) return <FileImage className="h-6 w-6" />;
    if (mimeType.includes('pdf')) return <FileText className="h-6 w-6" />;
    return <FileIcon className="h-6 w-6" />;
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    const filtered = files.filter(file =>
      file.filename.toLowerCase().includes(query.toLowerCase()) ||
      file.mime_type.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredFiles(filtered);
  };

  const handleSort = (field: SortField) => {
    const newOrder = field === sortField && sortOrder === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortOrder(newOrder);

    const sorted = [...filteredFiles].sort((a, b) => {
      if (field === "size_bytes") {
        return sortOrder === "asc" ? a[field] - b[field] : b[field] - a[field];
      }
      const valueA = String(a[field]).toLowerCase();
      const valueB = String(b[field]).toLowerCase();
      return sortOrder === "asc"
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    });
    setFilteredFiles(sorted);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  if (isLoading) {
    return <div className="text-center py-8">Loading files...</div>;
  }

  const renderListView = () => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead 
              className="w-[40%] cursor-pointer"
              onClick={() => handleSort("filename")}
            >
              Name {sortField === "filename" && (sortOrder === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead 
              className="hidden md:table-cell cursor-pointer"
              onClick={() => handleSort("mime_type")}
            >
              Type {sortField === "mime_type" && (sortOrder === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead 
              className="hidden sm:table-cell cursor-pointer"
              onClick={() => handleSort("size_bytes")}
            >
              Size {sortField === "size_bytes" && (sortOrder === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead 
              className="hidden lg:table-cell cursor-pointer"
              onClick={() => handleSort("created_at")}
            >
              Date {sortField === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredFiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center">
                No files found
              </TableCell>
            </TableRow>
          ) : (
            filteredFiles.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">
                  <button
                    onClick={() => handlePreview(file)}
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    {getFileIcon(file.mime_type)}
                    {file.filename}
                  </button>
                </TableCell>
                <TableCell className="hidden md:table-cell">{file.mime_type}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatFileSize(file.size_bytes)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {formatDate(file.created_at)}
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

  const renderGridView = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filteredFiles.map((file) => (
        <div
          key={file.id}
          className="p-4 border rounded-lg hover:border-primary transition-colors"
        >
          <button
            onClick={() => handlePreview(file)}
            className="w-full text-left"
          >
            <div className="flex flex-col items-center gap-2">
              {getFileIcon(file.mime_type)}
              <p className="text-sm font-medium truncate w-full text-center">
                {file.filename}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(file.size_bytes)}
              </p>
            </div>
          </button>
          <div className="mt-4 flex justify-center">
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(file.id, file.path);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 w-full sm:max-w-xs">
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === "list" ? renderListView() : renderGridView()}

      <Dialog 
        open={!!previewFile} 
        onOpenChange={(open) => !open && setPreviewFile(null)}
      >
        {previewFile && (
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>{previewFile.filename}</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              {previewFile.mime_type.startsWith('image/') ? (
                <img
                  src={supabase.storage.from('files').getPublicUrl(previewFile.path).data.publicUrl}
                  alt={previewFile.filename}
                  className="max-w-full h-auto"
                />
              ) : (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-center">Preview not available for this file type</p>
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    {previewFile.mime_type}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
