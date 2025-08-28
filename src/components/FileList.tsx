import { useEffect, useState, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Trash2, FileText, FileImage, FileIcon, Languages, AlertCircle, CheckCircle2, Sparkles, Download, Clock, MoreHorizontal, File, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { useFilesQuery, useFilesCountQuery, useDeleteFileMutation, FileWithMetadata, parseEmbeddingStatus } from "@/hooks/use-files-query";
import { useQueryClient } from "@tanstack/react-query";

import logger from '@/utils/logger';
// Feature flags to show/hide optional columns
const SHOW_SIZE_COLUMN = false;
const SHOW_LANGUAGE_COLUMN = false;
const MAX_FILE_NAME_LENGTH = 30;

interface FileListProps {
  searchTerm?: string;
}

export function FileList({ searchTerm = '' }: FileListProps) {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(20); // Fixed page size for now
  const isMobile = useIsMobile();
  
  // Use React Query for optimized data fetching and caching with pagination
  const { data: files = [], isLoading, error, refetch } = useFilesQuery(currentPage, pageSize);
  const { data: totalCount = 0 } = useFilesCountQuery();
  const deleteFileMutation = useDeleteFileMutation();
  const queryClient = useQueryClient();
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
  // Use derived state for filteredFiles to avoid infinite loops
  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) {
      return files;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return files.filter(file => 
      file.filename.toLowerCase().includes(searchLower) ||
      file.original_name.toLowerCase().includes(searchLower)
    );
  }, [files, searchTerm]);
  
  // Memoized file IDs to prevent unnecessary WhatsApp mapping reloads
  const fileIds = useMemo(() => {
    return files.map(f => f.id);
  }, [files]);

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

        // Update React Query cache with optimistic update for INSERT
        // New files should always appear on page 0 (most recent), not current viewing page
        queryClient.setQueryData(['files', user.id, 0, pageSize], (oldData: FileWithMetadata[] | undefined) => {
          const currentFiles = oldData || [];
          return [fileWithMetadata, ...currentFiles];
        });
        
        // If user is not on page 0, also invalidate all other pages to maintain consistency
        if (currentPage !== 0) {
          queryClient.invalidateQueries({ queryKey: ['files', user.id] });
        }
        
        // Invalidate count query to get updated total
        queryClient.invalidateQueries({ queryKey: ['files-count', user.id] });
        
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
        const oldFile = payload.old as any; // Previous row state
        
        // Only process updates for fields that actually matter for the UI
        const relevantFieldsChanged = 
          oldFile.embedding_status !== updatedFile.embedding_status ||
          oldFile.text_extraction_status !== updatedFile.text_extraction_status ||
          oldFile.language_detection_status !== updatedFile.language_detection_status ||
          oldFile.primary_language !== updatedFile.primary_language;
        
        // Skip update if no relevant fields changed
        if (!relevantFieldsChanged) {
          return;
        }
        
        // Create optimized update object with only necessary fields
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

        // Update React Query cache with optimistic update for UPDATE
        queryClient.setQueryData(['files', user.id, currentPage, pageSize], (oldData: FileWithMetadata[] | undefined) => {
          const currentFiles = oldData || [];
          return currentFiles.map(file => 
            file.id === updatedFile.id ? fileWithMetadata : file
          );
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'files',
        filter: `profile_id=eq.${user.id}`
      }, (payload) => {
        logger.log('Received real-time DELETE for file:', payload);
        const deletedFile = payload.old as any; // Raw database row
        
        // For DELETE events, invalidate all pages since the file could be on any page
        // This ensures consistent state across all cached pages
        queryClient.invalidateQueries({ queryKey: ['files', user.id] });
        queryClient.invalidateQueries({ queryKey: ['files-count', user.id] });
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
  }, [user, toast, currentPage, pageSize, queryClient]);
  // Optimized delete function using React Query mutation
  const deleteFile = async (fileId: string) => {
    try {
      await deleteFileMutation.mutateAsync(fileId);
      toast({
        title: "Success",
        description: "File deleted successfully."
      });
    } catch (error) {
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
      // Use React Query refetch for optimized data refresh
      refetch();
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
      if (fileIds.length === 0 || !user) return;
      try {
        const { data, error } = await supabase
          .from('whatsapp_file_mappings')
          .select('file_id, whatsapp_instance_id')
          .in('file_id', fileIds)
          .eq('user_id', user.id);
        if (error) throw error;
        const map: Record<string, string | null> = {};
        for (const id of fileIds) map[id] = null;
        (data || []).forEach(m => {
          map[m.file_id as string] = m.whatsapp_instance_id as string;
        });
        setFileIdToInstanceId(map);
      } catch (err) {
        logger.error('Failed to load file mappings', err);
      }
    };
    loadMappings();
  }, [fileIds, user]);

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



  // Memoized helper functions for performance
  const getRelativeTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  }, []);

  const formatFileSize = useCallback((sizeInBytes: number) => {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  }, []);

  const renderEmbeddingStatus = useCallback((file: FileWithMetadata) => {
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
      return <Badge variant="outline" className="font-normal bg-blue-600 hover:bg-blue-700 text-white border-blue-600 flex items-center gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          <span>Ready</span>
        </Badge>;
    }
    if (status === 'partial') {
      return <Badge variant="outline" className="bg-amber-100 text-amber-800 flex items-center gap-1 text-xs border-amber-200">
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
  }, [isGenerating, processingFileId]);

  const renderLanguageInfo = useCallback((file: FileWithMetadata) => {
    if (!file.detected_languages || file.detected_languages.length === 0) {
      return <div className="flex items-center text-xs text-slate-500">
          <Languages className="h-3 w-3 mr-1" />
          <span>Unknown</span>
        </div>;
    }
    const primaryLanguage = file.primary_language || file.detected_languages[0];
    const languageConfidence = file.language_confidence ? (file.language_confidence[primaryLanguage] || 0) * 100 : 0;
    return <Tooltip>
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
        </Tooltip>;
  }, []);

  // Mobile card layout for files
  const renderFilesCards = (filesToRender: FileWithMetadata[]) => (
    <div className="space-y-4">
      {filesToRender.map((file) => (
        <Card key={file.id} className="overflow-hidden border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  {getFileIcon(file.mime_type)}
                </div>
                <div className="min-w-0 flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate cursor-help">
                        {file.filename}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{file.filename}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">More actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {/* Status Row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</span>
              <div className="flex items-center space-x-2">
                {renderEmbeddingStatus(file)}
                {(file.embedding_status?.status === 'processing' || isGenerating && processingFileId === file.id) && (
                  <div className="flex items-center space-x-2">
                    <Progress value={progress} className="h-1 w-16" />
                    <span className="text-xs text-slate-500">{progress}%</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* WhatsApp Instance Row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">WhatsApp Instance</span>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={!!isLinking[file.id]} 
                onClick={() => {
                  const currentId = fileIdToInstanceId[file.id] ?? null;
                  const idx = currentId ? instances.findIndex(i => i.id === currentId) : -1;
                  const nextId = idx === -1 ? (instances[0]?.id || null) : (instances[idx + 1]?.id ?? null);
                  handleLinkChange(file.id, nextId);
                }}
                className="text-xs"
              >
                {isLinking[file.id] ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving
                  </>
                ) : (
                  fileIdToInstanceId[file.id] ? (instances.find(i => i.id === fileIdToInstanceId[file.id])?.instance_name || 'Linked') : 'Unlinked'
                )}
              </Button>
            </div>
            
            {/* Upload Date Row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Uploaded</span>
              <div className="flex items-center space-x-1 text-xs text-slate-600 dark:text-slate-400">
                <Clock className="h-3 w-3" />
                <span>{getRelativeTime(file.created_at)}</span>
              </div>
            </div>
            
            {/* Language Info (if available) */}
            {SHOW_LANGUAGE_COLUMN && file.detected_languages && file.detected_languages.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Language</span>
                {renderLanguageInfo(file)}
              </div>
            )}
            
            {/* File Size (if shown) */}
            {SHOW_SIZE_COLUMN && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Size</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {formatFileSize(file.size_bytes)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

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
      {/* Modern Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center space-y-3">
            {/* Modern animated loader */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full border-2 border-blue-100 dark:border-blue-900"></div>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
              </div>
            </div>
            {/* Loading text */}
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading your files...</p>
          </div>
        </div>
      ) : filteredFiles.length === 0 && searchTerm.trim() ? (
        /* No Search Results */
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No files found</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            No files match your search for "{searchTerm}". Try adjusting your search terms.
          </p>
        </div>
      ) : files.length === 0 ? (
        /* Empty State */
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <File className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No files uploaded yet</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Upload your first document to get started.
          </p>
        </div>
      ) : (
        <>
          {/* All Files Section */}
          <div>
            {isMobile ? renderFilesCards(filteredFiles) : renderFilesTable(filteredFiles)}
          </div>
          
          {/* Pagination Controls */}
          {(searchTerm.trim() ? filteredFiles.length > pageSize : totalCount > pageSize) && (
            <div className="flex items-center justify-between px-2 py-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>
                  {searchTerm.trim() ? 
                    `Showing ${filteredFiles.length} of ${totalCount} files (filtered)` :
                    `Showing ${currentPage * pageSize + 1} to ${Math.min((currentPage + 1) * pageSize, totalCount)} of ${totalCount} files`
                  }
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(totalCount / pageSize) }, (_, i) => (
                    <Button
                      key={i}
                      variant={currentPage === i ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(i)}
                      className="w-8 h-8 p-0"
                      disabled={Math.ceil(totalCount / pageSize) > 10 && Math.abs(currentPage - i) > 2 && i !== 0 && i !== Math.ceil(totalCount / pageSize) - 1}
                      style={{
                        display: Math.ceil(totalCount / pageSize) > 10 && Math.abs(currentPage - i) > 2 && i !== 0 && i !== Math.ceil(totalCount / pageSize) - 1 ? 'none' : 'flex'
                      }}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize) - 1, p + 1))}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize) - 1}
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}


    </div>
  );
}
