
import { useEffect, useState } from "react";
import { Grid, List, Trash2, FileText, FileImage, FileIcon, Languages, AlertCircle, CheckCircle2, ChevronDown, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDocumentEmbeddings, EmbeddingStatus, EmbeddingStatusDetails } from "@/hooks/use-document-embeddings";
import { Progress } from "@/components/ui/progress";
import { Json } from "@/integrations/supabase/types";

interface File {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  path: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
  metadata: any;
}

const MAX_FILE_NAME_LENGTH = 30;

interface FileWithMetadata {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  path: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
  metadata: any;
  embedding_status?: EmbeddingStatusDetails;
  primary_language?: string;
  language_confidence?: any;
  language_detection_status?: any;
  detected_languages?: string[];
  text_extraction_status?: any;
}

// Helper function to safely convert JSON to EmbeddingStatusDetails
const parseEmbeddingStatus = (jsonData: Json | null): EmbeddingStatusDetails | undefined => {
  if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    return undefined;
  }
  
  const statusObj = jsonData as Record<string, any>;
  
  return {
    status: (statusObj.status as EmbeddingStatus) || 'pending',
    started_at: typeof statusObj.started_at === 'string' ? statusObj.started_at : undefined,
    completed_at: typeof statusObj.completed_at === 'string' ? statusObj.completed_at : undefined, 
    success_count: typeof statusObj.success_count === 'number' ? statusObj.success_count : undefined,
    error_count: typeof statusObj.error_count === 'number' ? statusObj.error_count : undefined,
    last_updated: typeof statusObj.last_updated === 'string' ? statusObj.last_updated : undefined,
    error: typeof statusObj.error === 'string' ? statusObj.error : undefined
  };
};

export function FileList() {
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGridView, setIsGridView] = useState(false);
  const { toast } = useToast();
  const { generateEmbeddings, isGenerating, progress } = useDocumentEmbeddings();
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<FileWithMetadata[]>([]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching files:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load files. Please try again."
        });
      } else {
        const filesWithMetadata: FileWithMetadata[] = data.map(file => {
          const embeddingStatus = parseEmbeddingStatus(file.embedding_status);
          
          return {
            ...file,
            metadata: {},
            primary_language: file.primary_language || 'unknown',
            detected_languages: file.detected_languages || [],
            embedding_status: embeddingStatus
          };
        });
        
        setFiles(filesWithMetadata);
        setFilteredFiles(filesWithMetadata);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      if (error) {
        console.error("Error deleting file:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete file. Please try again."
        });
      } else {
        setFiles(files.filter(file => file.id !== fileId));
        toast({
          title: "Success",
          description: "File deleted successfully."
        });
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete file. Please try again."
      });
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <FileImage className="w-4 h-4 mr-2" />;
    } else if (mimeType === 'application/pdf') {
      return <FileText className="w-4 h-4 mr-2" />;
    } else if (mimeType === 'text/plain') {
      return <FileText className="w-4 h-4 mr-2" />;
    } else if (mimeType === 'text/csv') {
      return <FileText className="w-4 h-4 mr-2" />;
    } else if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return <FileText className="w-4 h-4 mr-2" />;
    } else if (mimeType === 'application/msword') {
      return <FileText className="w-4 h-4 mr-2" />;
    }
    return <FileIcon className="w-4 h-4 mr-2" />;
  };

  const getLanguageFromFilename = (filename: string) => {
    const parts = filename.split('.');
    const extension = parts.pop()?.toLowerCase();

    switch (extension) {
      case 'en': return 'English';
      case 'es': return 'Spanish';
      case 'fr': return 'French';
      case 'de': return 'German';
      case 'zh': return 'Chinese';
      case 'ja': return 'Japanese';
      default: return 'Unknown';
    }
  };

  const handleGenerateEmbeddings = async (fileId: string) => {
    setProcessingFileId(fileId);
    const success = await generateEmbeddings(fileId);
    if (success) {
      fetchFiles();
    }
    setProcessingFileId(null);
  };

  const renderFileCard = (file: FileWithMetadata) => {
    const truncatedFilename =
      file.filename.length > MAX_FILE_NAME_LENGTH
        ? file.filename.substring(0, MAX_FILE_NAME_LENGTH) + '...'
        : file.filename;

    const renderEmbeddingStatus = () => {
      if (!file.embedding_status) {
        return (
          <Button 
            size="sm" 
            variant="outline" 
            className="ml-auto flex items-center gap-1"
            onClick={() => handleGenerateEmbeddings(file.id)}
            disabled={isGenerating && processingFileId === file.id}
          >
            <Sparkles className="h-3 w-3" />
            <span>Generate Embeddings</span>
          </Button>
        );
      }

      const status = file.embedding_status.status;
      
      if (status === 'processing' || (isGenerating && processingFileId === file.id)) {
        return (
          <div className="ml-auto flex flex-col gap-1 min-w-[150px]">
            <span className="text-xs text-muted-foreground">Processing embeddings...</span>
            <Progress value={progress} className="h-1" />
          </div>
        );
      }
      
      if (status === 'complete') {
        return (
          <div className="ml-auto flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-xs">Embeddings ready</span>
          </div>
        );
      }
      
      if (status === 'partial') {
        return (
          <div className="ml-auto flex flex-col gap-1">
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Partial embeddings
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs h-6"
              onClick={() => handleGenerateEmbeddings(file.id)}
            >
              Retry
            </Button>
          </div>
        );
      }
      
      if (status === 'error') {
        return (
          <div className="ml-auto flex flex-col gap-1">
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Embedding failed
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs h-6"
              onClick={() => handleGenerateEmbeddings(file.id)}
            >
              Retry
            </Button>
          </div>
        );
      }
      
      return (
        <Button 
          size="sm" 
          variant="outline" 
          className="ml-auto flex items-center gap-1"
          onClick={() => handleGenerateEmbeddings(file.id)}
        >
          <Sparkles className="h-3 w-3" />
          <span>Generate Embeddings</span>
        </Button>
      );
    };

    return (
      <Card key={file.id} className="group relative">
        <CardHeader>
          <CardTitle className="flex items-center">
            {getFileIcon(file.mime_type)}
            {truncatedFilename}
          </CardTitle>
          <CardDescription>
            {new Date(file.created_at).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Size: {(file.size_bytes / 1024).toFixed(2)} KB
          </p>
        </CardContent>
        
        <CardFooter className="flex justify-between items-center pt-2 gap-2">
          <div className="flex items-center">
            <Languages className="h-3 w-3 mr-1 text-gray-500" />
            <span className="text-xs text-gray-500">
              {getLanguageFromFilename(file.filename)}
            </span>
          </div>
          
          {renderEmbeddingStatus()}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="ml-auto h-8 w-8 p-0 data-[state=open]:bg-muted">
                <span className="sr-only">Open menu</span>
                <ChevronDown className="h-4 w-4"/>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem
                onClick={() => deleteFile(file.id)}
              >
                <Trash2 className="h-3 w-3 mr-2"/>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Uploaded Files ({files.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsGridView(!isGridView)}
        >
          {isGridView ? <List className="w-4 h-4 mr-2" /> : <Grid className="w-4 h-4 mr-2" />}
          {isGridView ? 'List View' : 'Grid View'}
        </Button>
      </div>

      {isLoading ? (
        <p>Loading files...</p>
      ) : files.length === 0 ? (
        <p>No files uploaded yet.</p>
      ) : isGridView ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {files.map(file => renderFileCard(file))}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(file => renderFileCard(file))}
        </div>
      )}
    </div>
  );
}
