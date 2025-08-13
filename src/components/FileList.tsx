import { useEffect, useState, useCallback } from "react";
import { Trash2, FileText, FileImage, FileIcon, Languages, AlertCircle, CheckCircle2, Sparkles, Download, Eye, Calendar, Clock, MoreHorizontal, FileSearch, User, File, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDocumentEmbeddings, EmbeddingStatus, EmbeddingStatusDetails } from "@/hooks/use-document-embeddings";
import { Progress } from "@/components/ui/progress";
import { Json } from "@/integrations/supabase/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { ChunksViewer } from "@/components/ChunksViewer";

import logger from '@/utils/logger';
// Feature flags to show/hide optional columns
const SHOW_SIZE_COLUMN = false;
const SHOW_LANGUAGE_COLUMN = false;
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

  embedding_status?: EmbeddingStatusDetails;
  primary_language?: string;
  language_confidence?: any;
  language_detection_status?: any;
  detected_languages?: string[];
  text_extraction_status?: any;
  text_content?: string;
}
const parseEmbeddingStatus = (jsonData: Json | null): EmbeddingStatusDetails | undefined => {
  if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    return undefined;
  }
  const statusObj = jsonData as Record<string, any>;
  return {
    status: statusObj.status as EmbeddingStatus || 'pending',
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
  const {
    toast
  } = useToast();
  const {
    generateEmbeddings,
    isGenerating,
    progress
  } = useDocumentEmbeddings();
  const { user } = useAuth();
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<FileWithMetadata[]>([]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Initial data fetch
  useEffect(() => {
    fetchFiles();
  }, [refreshTrigger]);

  // Real-time subscription for files table
  useEffect(() => {
    if (!user) return;

    logger.log('Setting up real-time subscription for files table', {
      userId: user.id
    });

    const channel = supabase
      .channel('files-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'files',
        filter: `profile_id=eq.${user.id}`
      }, (payload) => {
        logger.log('Received real-time INSERT for file:', payload);
        const newFile = payload.new as any; // Raw database row
        
        // Add the new file to the state with proper metadata
        const fileWithMetadata: FileWithMetadata = {
          ...newFile,
          primary_language: newFile.primary_language || 'unknown',
          language_confidence: newFile.language_confidence || {},
          detected_languages: newFile.detected_languages || [],
          language_detection_status: newFile.language_detection_status || {
            status: 'pending'
          },
          text_extraction_status: newFile.text_extraction_status || {
            status: 'pending'
          },
          embedding_status: parseEmbeddingStatus(newFile.embedding_status)
        };

        setFiles(prevFiles => [fileWithMetadata, ...prevFiles]);
        setFilteredFiles(prevFiles => [fileWithMetadata, ...prevFiles]);
        
        toast({
          title: "File Added",
          description: `${newFile.filename} has been uploaded successfully.`
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'files',
        filter: `profile_id=eq.${user.id}`
      }, (payload) => {
        logger.log('Received real-time UPDATE for file:', payload);
        const updatedFile = payload.new as any; // Raw database row
        
        // Update the file in the state
        const fileWithMetadata: FileWithMetadata = {
          ...updatedFile,
          primary_language: updatedFile.primary_language || 'unknown',
          language_confidence: updatedFile.language_confidence || {},
          detected_languages: updatedFile.detected_languages || [],
          language_detection_status: updatedFile.language_detection_status || {
            status: 'pending'
          },
          text_extraction_status: updatedFile.text_extraction_status || {
            status: 'pending'
          },
          embedding_status: parseEmbeddingStatus(updatedFile.embedding_status)
        };

        setFiles(prevFiles => 
          prevFiles.map(file => 
            file.id === updatedFile.id ? fileWithMetadata : file
          )
        );
        setFilteredFiles(prevFiles => 
          prevFiles.map(file => 
            file.id === updatedFile.id ? fileWithMetadata : file
          )
        );
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'files',
        filter: `profile_id=eq.${user.id}`
      }, (payload) => {
        logger.log('Received real-time DELETE for file:', payload);
        const deletedFile = payload.old as any; // Raw database row
        
        setFiles(prevFiles => 
          prevFiles.filter(file => file.id !== deletedFile.id)
        );
        setFilteredFiles(prevFiles => 
          prevFiles.filter(file => file.id !== deletedFile.id)
        );
      })
      .subscribe((status) => {
        logger.log(`Supabase files channel status: ${status}`);
        if (status === 'SUBSCRIBED') {
          logger.log('Successfully subscribed to files table changes');
        }
      });

    // Cleanup subscription
    return () => {
      logger.log('Cleaning up files real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, toast]);
  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const {
        data: filesData,
        error: filesError
      } = await supabase.from('files').select('*').order('created_at', {
        ascending: false
      });
      if (filesError) {
        logger.error("Error fetching files:", filesError);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load files. Please try again."
        });
        setIsLoading(false);
        return;
      }
      const filesWithMetadata: FileWithMetadata[] = filesData.map(file => {
        const embeddingStatus = parseEmbeddingStatus(file.embedding_status);
        return {
          ...file,
          primary_language: file.primary_language || 'unknown',
          language_confidence: file.language_confidence || {},
          detected_languages: file.detected_languages || [],
          language_detection_status: file.language_detection_status || {
            status: 'pending'
          },
          text_extraction_status: file.text_extraction_status || {
            status: 'pending'
          },
          embedding_status: embeddingStatus
        };
      });
      setFiles(filesWithMetadata);
      setFilteredFiles(filesWithMetadata);
    } catch (error) {
      logger.error("Error in fetchFiles:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while loading files."
      });
    } finally {
      setIsLoading(false);
    }
  };
  const deleteFile = async (fileId: string) => {
    try {
      const {
        error
      } = await supabase.from('files').delete().eq('id', fileId);
      if (error) {
        logger.error("Error deleting file:", error);
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
      logger.error("Error deleting file:", error);
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
    }
    return <FileIcon className="w-4 h-4 mr-2" />;
  };
  const handleGenerateEmbeddings = async (fileId: string) => {
    setProcessingFileId(fileId);
    const success = await generateEmbeddings(fileId);
    if (success) {
      fetchFiles();
    }
    setProcessingFileId(null);
  };

  const handleDownloadFile = async (file: FileWithMetadata) => {
    try {
      const { data, error } = await supabase.storage
        .from('files')
        .createSignedUrl(file.path, 60); // 60 seconds expiry

      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to generate download link"
        });
        return;
      }

      // Create download link
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = file.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download Started",
        description: `${file.original_name} is being downloaded`
      });
    } catch (error) {
      logger.error('Error downloading file:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to download file"
      });
    }
  };

  const [previewFile, setPreviewFile] = useState<FileWithMetadata | null>(null);
  const [chunksViewerFile, setChunksViewerFile] = useState<FileWithMetadata | null>(null);

  // WhatsApp linking state
  const [instances, setInstances] = useState<Array<{ id: string; instance_name: string; status?: string }>>([]);
  const [fileIdToInstanceId, setFileIdToInstanceId] = useState<Record<string, string | null>>({});
  const [isLinking, setIsLinking] = useState<Record<string, boolean>>({});

  // Load WhatsApp instances for current user
  useEffect(() => {
    const loadInstances = async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_instances')
          .select('id, instance_name, status')
          .eq('user_id', user?.id);
        if (error) throw error;
        setInstances(data || []);
      } catch (err) {
        logger.error('Failed to load WhatsApp instances', err);
      }
    };
    if (user) loadInstances();
  }, [user]);

  // Load existing mappings for currently loaded files
  useEffect(() => {
    const loadMappings = async () => {
      if (files.length === 0 || !user) return;
      try {
        const fileIds = files.map(f => f.id);
        const { data, error } = await supabase
          .from('whatsapp_file_mappings')
          .select('file_id, whatsapp_instance_id')
          .in('file_id', fileIds)
          .eq('user_id', user.id);
        if (error) throw error;
        const map: Record<string, string | null> = {};
        for (const f of files) map[f.id] = null;
        (data || []).forEach(m => {
          map[m.file_id as string] = m.whatsapp_instance_id as string;
        });
        setFileIdToInstanceId(map);
      } catch (err) {
        logger.error('Failed to load file mappings', err);
      }
    };
    loadMappings();
  }, [files, user]);

  const handleLinkChange = async (fileId: string, instanceId: string | null) => {
    if (!user) return;
    setIsLinking(prev => ({ ...prev, [fileId]: true }));
    try {
      // Remove existing mappings for this file for this user
      const { error: delErr } = await supabase
        .from('whatsapp_file_mappings')
        .delete()
        .eq('file_id', fileId)
        .eq('user_id', user.id);
      if (delErr) throw delErr;

      if (instanceId) {
        const { error: insErr } = await supabase
          .from('whatsapp_file_mappings')
          .insert({
            user_id: user.id,
            whatsapp_instance_id: instanceId,
            file_id: fileId,
          });
        if (insErr) throw insErr;
      }
      setFileIdToInstanceId(prev => ({ ...prev, [fileId]: instanceId }));
      toast({ title: 'Updated', description: instanceId ? 'File linked to WhatsApp instance' : 'Link removed' });
    } catch (err) {
      logger.error('Failed to update mapping', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update WhatsApp link' });
    } finally {
      setIsLinking(prev => ({ ...prev, [fileId]: false }));
    }
  };

  const handlePreviewFile = (file: FileWithMetadata) => {
    setPreviewFile(file);
  };

  const handleViewChunks = (file: FileWithMetadata) => {
    setChunksViewerFile(file);
  };

  // Helper functions
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const formatFileSize = (sizeInBytes: number) => {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  };

  const renderEmbeddingStatus = (file: FileWithMetadata) => {
    if (!file.embedding_status) {
      return <Badge variant="outline" className="flex items-center gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          <span>Generate</span>
        </Badge>;
    }
    const status = file.embedding_status.status;
    if (status === 'processing' || isGenerating && processingFileId === file.id) {
      return <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span>Processing</span>
        </Badge>;
    }
    if (status === 'complete') {
      return <Badge variant="default" className="font-normal bg-blue-600 hover:bg-blue-700 flex items-center gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          <span>Ready</span>
        </Badge>;
    }
    if (status === 'partial') {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800 flex items-center gap-1 text-xs">
          <AlertCircle className="h-3 w-3" />
          <span>Partial</span>
        </Badge>;
    }
    if (status === 'error') {
      return <Badge variant="destructive" className="flex items-center gap-1 text-xs">
          <AlertCircle className="h-3 w-3" />
          <span>Error</span>
        </Badge>;
    }
    return <Badge variant="outline" className="flex items-center gap-1 text-xs">
        <Sparkles className="h-3 w-3" />
        <span>Generate</span>
      </Badge>;
  };

  const renderLanguageInfo = (file: FileWithMetadata) => {
    if (!file.detected_languages || file.detected_languages.length === 0) {
      return <div className="flex items-center text-xs text-slate-500">
          <Languages className="h-3 w-3 mr-1" />
          <span>Unknown</span>
        </div>;
    }
    const primaryLanguage = file.primary_language || file.detected_languages[0];
    const languageConfidence = file.language_confidence ? (file.language_confidence[primaryLanguage] || 0) * 100 : 0;
    return <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help text-xs">
              <Languages className="h-3 w-3 text-slate-400" />
              <span className="text-slate-600 dark:text-slate-400">
                {primaryLanguage} 
                {languageConfidence > 0 && ` (${languageConfidence.toFixed(0)}%)`}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="text-xs font-semibold">Detected Languages:</p>
              {file.detected_languages.map(lang => {
              const confidence = file.language_confidence ? (file.language_confidence[lang] || 0) * 100 : 0;
              return <div key={lang} className="text-xs flex justify-between gap-2">
                    <span>{lang}</span>
                    {confidence > 0 && <span>{confidence.toFixed(0)}%</span>}
                  </div>;
            })}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>;
  };


  const renderFilesTable = (filesToRender: FileWithMetadata[], showHeader = true) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
              <TableHead className="pl-6 text-left font-medium text-slate-700 dark:text-slate-300">
                File Name
              </TableHead>
              {SHOW_SIZE_COLUMN && (
                <TableHead className="text-left font-medium text-slate-700 dark:text-slate-300">
                  Size
                </TableHead>
              )}
              {SHOW_LANGUAGE_COLUMN && (
                <TableHead className="text-left font-medium text-slate-700 dark:text-slate-300">
                  Language
                </TableHead>
              )}
              <TableHead className="text-left font-medium text-slate-700 dark:text-slate-300">
                Status
              </TableHead>
              <TableHead className="text-left font-medium text-slate-700 dark:text-slate-300">
                WhatsApp Instance
              </TableHead>
              <TableHead className="text-left font-medium text-slate-700 dark:text-slate-300">
                Upload date
              </TableHead>
              <TableHead className="text-center font-medium text-slate-700 dark:text-slate-300 pr-6">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {filesToRender.map((file) => (
            <TableRow key={file.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              {/* File Name & Icon */}
              <TableCell className="pl-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {getFileIcon(file.mime_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate cursor-help max-w-xs">
                            {file.filename}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{file.filename}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </TableCell>

              {/* File Size */}
              {SHOW_SIZE_COLUMN && (
                <TableCell>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {formatFileSize(file.size_bytes)}
                  </span>
                </TableCell>
              )}

              {/* Language */}
              {SHOW_LANGUAGE_COLUMN && (
                <TableCell>
                  {renderLanguageInfo(file)}
                </TableCell>
              )}

              {/* Status */}
              <TableCell>
                <div className="flex items-center space-x-2">
                  {renderEmbeddingStatus(file)}
                  {(file.embedding_status?.status === 'processing' || isGenerating && processingFileId === file.id) && (
                    <div className="flex items-center space-x-2">
                      <Progress value={progress} className="h-1 w-16" />
                      <span className="text-xs text-slate-500">{progress}%</span>
                    </div>
                  )}
                </div>
              </TableCell>

              {/* WhatsApp Instance Link */}
              <TableCell>
                <div className="hidden md:block max-w-[220px]">
                  <Select
                    value={fileIdToInstanceId[file.id] ?? '__unlinked__'}
                    onValueChange={(val) => handleLinkChange(file.id, val === '__unlinked__' ? null : val)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={isLinking[file.id] ? 'Saving...' : (fileIdToInstanceId[file.id] ? (instances.find(i => i.id === fileIdToInstanceId[file.id])?.instance_name || 'Linked') : 'Unlinked')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unlinked__">Unlinked</SelectItem>
                      {instances.map(inst => (
                        <SelectItem key={inst.id} value={inst.id}>{inst.instance_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:hidden">
                  <Button variant="outline" size="sm" disabled={!!isLinking[file.id]} onClick={() => { /* simple fallback for mobile: cycle through options */
                    const currentId = fileIdToInstanceId[file.id] ?? null;
                    const idx = currentId ? instances.findIndex(i => i.id === currentId) : -1;
                    const nextId = idx === -1 ? (instances[0]?.id || null) : (instances[idx + 1]?.id ?? null);
                    handleLinkChange(file.id, nextId);
                  }}>
                    {isLinking[file.id] ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving
                      </>
                    ) : (
                      fileIdToInstanceId[file.id] ? (instances.find(i => i.id === fileIdToInstanceId[file.id])?.instance_name || 'Linked') : 'Unlinked'
                    )}
                  </Button>
                </div>
              </TableCell>

              {/* Upload date */}
              <TableCell>
                <div className="flex items-center space-x-1 text-sm text-slate-600 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  <span>{getRelativeTime(file.created_at)}</span>
                </div>
              </TableCell>

              {/* Actions */}
              <TableCell className="text-center pr-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handlePreviewFile(file)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview Content
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleViewChunks(file)}>
                      <FileSearch className="h-4 w-4 mr-2" />
                      View Text Chunks
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download File
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateEmbeddings(file.id)} disabled={isGenerating && processingFileId === file.id}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {file.embedding_status?.status === 'complete' ? 'Regenerate' : 'Generate'} Embeddings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteFile(file.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete File
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-slate-600 dark:text-slate-400">Loading files...</span>
          </div>
        </div>
      ) : files.length === 0 ? (
        /* Empty State */
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <File className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No files uploaded yet</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Upload your first document to get started with AI-powered analysis and content processing.
          </p>
        </div>
      ) : (
        <>
          {/* All Files Section */}
          <div>
            {renderFilesTable(files)}
          </div>
        </>
      )}

      {/* File Preview Dialog */}
      {previewFile && (
        <AlertDialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
          <AlertDialogContent className="w-[min(calc(100vw-2rem),64rem)] sm:w-full max-w-4xl max-h-[80vh] rounded-xl sm:rounded-2xl overflow-y-auto overflow-x-hidden">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center space-x-2">
                {getFileIcon(previewFile.mime_type)}
                <span>{previewFile.filename}</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left">
                <div className="space-y-2 text-sm">
                  <div>Size: {formatFileSize(previewFile.size_bytes)}</div>
                  <div>Type: {previewFile.mime_type}</div>
                  <div>Language: {previewFile.primary_language || 'Unknown'}</div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-4">
              {previewFile.text_content ? (
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg max-h-96 overflow-y-auto overflow-x-hidden w-full max-w-full">
                  <pre className="whitespace-pre-wrap break-words break-all text-sm font-mono">
                    {previewFile.text_content.length > 2000 
                      ? previewFile.text_content.substring(0, 2000) + '...' 
                      : previewFile.text_content
                    }
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                  <FileIcon className="mx-auto h-12 w-12 mb-2" />
                  <p>Content not available or still processing</p>
                </div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setPreviewFile(null)}>
                Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Chunks Viewer Dialog */}
      <ChunksViewer
        fileId={chunksViewerFile?.id || null}
        fileName={chunksViewerFile?.filename || ""}
        isOpen={!!chunksViewerFile}
        onClose={() => setChunksViewerFile(null)}
      />
    </div>
  );
}
