import { useEffect, useState } from "react";
import { Grid, List, Search, Trash2, FileText, FileImage, FileIcon, Pencil, Check, X } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";

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
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFiles = async () => {
    try {
      console.log('Fetching files, current user:', user);
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('profile_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching files:', error);
        throw error;
      }
      
      console.log('Fetched files:', data);
      setFiles(data || []);
      setFilteredFiles(data || []);
    } catch (error: any) {
      console.error('Error in fetchFiles:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch files"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchFiles();
    }
  }, [user]);

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

  const handleStartRename = (file: FileItem) => {
    setEditingFileId(file.id);
    setNewFileName(file.filename);
  };

  const handleCancelRename = () => {
    setEditingFileId(null);
    setNewFileName("");
  };

  const handleSaveRename = async (file: FileItem) => {
    if (!newFileName.trim() || newFileName === file.filename) {
      handleCancelRename();
      return;
    }

    try {
      console.log('Attempting to rename file:', {
        fileId: file.id,
        oldName: file.filename,
        newName: newFileName.trim()
      });

      // First verify we can fetch the file using maybeSingle() instead of single()
      const { data: existingFile, error: fetchError } = await supabase
        .from('files')
        .select('*')
        .eq('id', file.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching file:', fetchError);
        throw fetchError;
      }

      if (!existingFile) {
        throw new Error('File not found');
      }

      // Then perform the update
      const { data: updatedFile, error: updateError } = await supabase
        .from('files')
        .update({ 
          filename: newFileName.trim(),
          original_name: newFileName.trim()
        })
        .eq('id', file.id)
        .eq('profile_id', user?.id) // Add this to ensure user owns the file
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Error updating file:', updateError);
        throw updateError;
      }

      if (!updatedFile) {
        throw new Error('Failed to update file - file not found or permission denied');
      }

      console.log('File renamed successfully:', {
        before: existingFile,
        after: updatedFile
      });

      // Update local state
      const updatedFiles = files.map(f => 
        f.id === file.id ? { 
          ...f, 
          filename: newFileName.trim(),
          original_name: newFileName.trim()
        } : f
      );
      
      setFiles(updatedFiles);
      setFilteredFiles(filteredFiles.map(f => 
        f.id === file.id ? { 
          ...f, 
          filename: newFileName.trim(),
          original_name: newFileName.trim()
        } : f
      ));

      // Show success notification
      toast({
        title: "File renamed",
        description: `Successfully renamed file to "${newFileName.trim()}"`,
        variant: "default"
      });

      // Refresh the file list to ensure we have the latest data
      fetchFiles();
    } catch (error: any) {
      console.error('Error in handleSaveRename:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to rename file"
      });
    } finally {
      handleCancelRename();
    }
  };

  const renderListView = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-md border overflow-hidden"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="w-[40%] cursor-pointer min-w-[200px]"
                onClick={() => handleSort("filename")}
              >
                Name {sortField === "filename" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead 
                className="hidden md:table-cell cursor-pointer min-w-[150px]"
                onClick={() => handleSort("mime_type")}
              >
                Type {sortField === "mime_type" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead 
                className="hidden sm:table-cell cursor-pointer min-w-[100px]"
                onClick={() => handleSort("size_bytes")}
              >
                Size {sortField === "size_bytes" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead 
                className="hidden lg:table-cell cursor-pointer min-w-[120px]"
                onClick={() => handleSort("created_at")}
              >
                Date {sortField === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="text-right min-w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      No files found
                    </motion.div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFiles.map((file) => (
                  <motion.tr
                    key={file.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.mime_type)}
                        {editingFileId === file.id ? (
                          <Input
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            className="max-w-[200px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(file);
                              if (e.key === 'Escape') handleCancelRename();
                            }}
                          />
                        ) : (
                          <span className="truncate">{file.filename}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="truncate">{file.mime_type}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatFileSize(file.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {editingFileId === file.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveRename(file)}
                              className="transition-all hover:scale-105"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelRename}
                              className="transition-all hover:scale-105"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartRename(file)}
                            className="transition-all hover:scale-105"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(file.id, file.path)}
                          className="transition-all hover:scale-105"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );

  const renderGridView = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
    >
      <AnimatePresence>
        {filteredFiles.map((file) => (
          <motion.div
            key={file.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.02 }}
            className="p-4 border rounded-lg hover:border-primary transition-all duration-200"
          >
            <div className="w-full text-left">
              <div className="flex flex-col items-center gap-2">
                {getFileIcon(file.mime_type)}
                {editingFileId === file.id ? (
                  <Input
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="max-w-[200px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(file);
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                  />
                ) : (
                  <p className="text-sm font-medium truncate w-full text-center">
                    {file.filename}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {formatFileSize(file.size_bytes)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {editingFileId === file.id ? (
                <>
                  <motion.div whileHover={{ scale: 1.1 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSaveRename(file)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.1 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelRename}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </>
              ) : (
                <motion.div whileHover={{ scale: 1.1 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStartRename(file)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
              <motion.div whileHover={{ scale: 1.1 }}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(file.id, file.path)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
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

      {isLoading ? (
        <div className="text-center py-8">Loading files...</div>
      ) : viewMode === "list" ? (
        renderListView()
      ) : (
        renderGridView()
      )}
    </div>
  );
}
