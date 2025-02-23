import { useEffect, useState } from "react";
import { Grid, List, Search, Trash2, FileText, FileImage, FileIcon, Languages, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileMetadataForm } from "./FileMetadataForm";
import { Tag } from "lucide-react";

type ValidationStatus = {
  isValid: boolean;
  chunks: Array<{
    isValid: boolean;
    errors: string[];
  }>;
};

type FileItem = {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  mime_type: string;
  path: string;
  primary_language?: string;
  text_direction?: string;
  detected_languages?: string[];
  text_validation_status?: ValidationStatus | null;
  language_confidence?: Record<string, number>;
  language_distribution?: Record<string, number>;
  arabic_script_details?: {
    containsArabicScript: boolean;
    arabicScriptPercentage: number;
    direction: string;
  };
};

type ViewMode = "list" | "grid";
type SortField = "filename" | "created_at" | "size_bytes" | "mime_type" | "primary_language";
type SortOrder = "asc" | "desc";

export function FileList() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFiles = async () => {
    try {
      console.log('Fetching files for user:', user?.id);
      if (!user) {
        console.log('No user found, skipping fetch');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching files:', error);
        toast({
          variant: "destructive",
          title: "Error fetching files",
          description: error.message
        });
        throw error;
      }
      
      console.log('Fetched files:', data);
      
      const parsedFiles = data?.map(file => ({
        ...file,
        text_validation_status: file.text_validation_status ? 
          (typeof file.text_validation_status === 'string' 
            ? JSON.parse(file.text_validation_status) 
            : file.text_validation_status) as ValidationStatus
          : null,
        language_confidence: file.language_confidence as Record<string, number>,
        language_distribution: file.language_distribution as Record<string, number>,
        arabic_script_details: file.arabic_script_details as FileItem['arabic_script_details']
      })) || [];

      setFiles(parsedFiles);
      setFilteredFiles(parsedFiles);
    } catch (error: any) {
      console.error('Error in fetchFiles:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch files. Please try refreshing the page."
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('FileList mounted, user:', user);
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

  const getLanguageDisplay = (file: FileItem) => {
    if (!file.primary_language && (!file.detected_languages || file.detected_languages.length === 0)) {
      return null;
    }

    const additionalLanguages = file.detected_languages?.filter(lang => lang !== file.primary_language) || [];

    return (
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4" />
        <div className="flex flex-wrap gap-1 items-center">
          {file.primary_language && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-xs">
                    {file.primary_language.toUpperCase()}
                    {file.language_confidence && (
                      <span className="ml-1 opacity-75">
                        {Math.round(file.language_confidence[file.primary_language] * 100)}%
                      </span>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Primary Language</p>
                  {file.arabic_script_details?.containsArabicScript && (
                    <p className="text-xs text-muted-foreground">
                      Contains Arabic Script ({Math.round(file.arabic_script_details.arabicScriptPercentage)}%)
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {additionalLanguages.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                  +{additionalLanguages.length} more <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2">
                <div className="space-y-2">
                  {additionalLanguages.map((lang, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {lang.toUpperCase()}
                      </Badge>
                      {file.language_confidence && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(file.language_confidence[lang] * 100)}% confidence
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    );
  };

  const renderMetadataDialog = (fileId: string) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-2">
          <Tag className="h-4 w-4 mr-2" />
          Metadata
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File Metadata</DialogTitle>
        </DialogHeader>
        <FileMetadataForm fileId={fileId} />
      </DialogContent>
    </Dialog>
  );

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
                className="w-[30%] cursor-pointer min-w-[200px]"
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
                onClick={() => handleSort("primary_language")}
              >
                Language {sortField === "primary_language" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="hidden xl:table-cell min-w-[100px]">
                Validation
              </TableHead>
              <TableHead 
                className="hidden xl:table-cell cursor-pointer min-w-[120px]"
                onClick={() => handleSort("created_at")}
              >
                Date {sortField === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="text-right min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
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
                      <div className={`flex items-center gap-2 ${file.text_direction === 'rtl' ? 'direction-rtl' : ''}`}>
                        {getFileIcon(file.mime_type)}
                        <span className="truncate">{file.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="truncate">{file.mime_type}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatFileSize(file.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {getLanguageDisplay(file)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-2">
                              {file.text_validation_status?.isValid ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <AlertCircle className="h-5 w-5 text-yellow-500" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-sm">
                              {file.text_validation_status?.isValid 
                                ? "Text validation passed"
                                : "Some chunks have validation issues"}
                            </div>
                            {!file.text_validation_status?.isValid && file.text_validation_status?.chunks.map((chunk, idx) => (
                              !chunk.isValid && (
                                <div key={idx} className="text-xs text-red-400 mt-1">
                                  {chunk.errors.join(", ")}
                                </div>
                              )
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(file.id, file.path)}
                        className="transition-all hover:scale-105"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => renderMetadataDialog(file.id)}
                      >
                        <Tag className="h-4 w-4 mr-2" />
                        Metadata
                      </Button>
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
            <div className={`w-full text-left ${file.text_direction === 'rtl' ? 'direction-rtl' : ''}`}>
              <div className="flex flex-col items-center gap-2">
                {getFileIcon(file.mime_type)}
                <p className="text-sm font-medium truncate w-full text-center">
                  {file.filename}
                </p>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size_bytes)}
                  </p>
                  {getLanguageDisplay(file)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <motion.div whileHover={{ scale: 1.1 }}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(file.id, file.path)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => renderMetadataDialog(file.id)}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Metadata
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
      ) : !user ? (
        <div className="text-center py-8">Please sign in to view your files</div>
      ) : viewMode === "list" ? (
        renderListView()
      ) : (
        renderGridView()
      )}
    </div>
  );
}
