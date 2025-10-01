import { useState, useRef } from "react";
import { Upload, AlertCircle, ChevronDown, ChevronUp, RefreshCw, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from 'react-i18next';

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDocumentEmbeddings } from "@/hooks/use-document-embeddings";
import { useQueryClient } from "@tanstack/react-query";
import logger from '@/utils/logger';

interface RetryState {
  attempts: number;
  lastError: string | null;
  operation: 'upload' | 'extraction';
}
interface ChunkingSettings {
  chunkSize: number;
  chunkOverlap: number;
}
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
export function FileUploader() {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [chunkingSettings, setChunkingSettings] = useState<ChunkingSettings>({
    chunkSize: 1024,
    chunkOverlap: 120
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    user
  } = useAuth();
  const {
    generateEmbeddings
  } = useDocumentEmbeddings();
  const queryClient = useQueryClient();
  const ALLOWED_FILE_TYPES = ['application/pdf', 'text/plain', 'text/csv'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const [retryState, setRetryState] = useState<RetryState>({
    attempts: 0,
    lastError: null,
    operation: 'upload'
  });
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const resetRetryState = () => {
    setRetryState({
      attempts: 0,
      lastError: null,
      operation: 'upload'
    });
  };
  // Simplified retry mechanism - user can manually retry by uploading again
  const handleRetry = () => {
    toast.info("Try Again", {
      description: "Please try uploading your file again."
    });
    resetRetryState();
  };
  const validateFile = (file: File) => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error("Invalid file type", {
        description: "Please upload a PDF, TXT, or CSV file"
      });
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large", {
        description: "File size should be less than 10MB"
      });
      return false;
    }
    return true;
  };
  const triggerTextExtraction = async (fileId: string) => {
    try {
      const {
        error: extractError
      } = await supabase.functions.invoke('extract-text', {
        body: {
          fileId,
          chunkingSettings: {
            chunkSize: chunkingSettings.chunkSize,
            chunkOverlap: chunkingSettings.chunkOverlap
          }
        }
      });
      if (extractError) {
        setRetryState(prev => ({
          attempts: prev.attempts,
          lastError: extractError.message,
          operation: 'extraction'
        }));
        throw extractError;
      }
      try {
        await generateEmbeddings(fileId);
      } catch (embeddingError) {
        logger.error('Error generating embeddings:', embeddingError);
        toast.error("Embeddings Generation", {
          description: "Text extraction completed, but embeddings generation encountered an issue."
        });
      }
      resetRetryState();
    } catch (error: any) {
      logger.error('Error in processing:', error);
      toast.error("Processing Error", {
        description: "Failed to process file. Click retry to attempt again.",
        action: retryState.attempts < MAX_RETRY_ATTEMPTS ? {
          label: `Retry (${MAX_RETRY_ATTEMPTS - retryState.attempts} left)`,
          onClick: handleRetry
        } : undefined
      });
    }
  };
  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;
    if (!validateFile(file)) return;
    setIsLoading(true);
    setUploadProgress(0);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);
      const {
        error: uploadError
      } = await supabase.storage.from('files').upload(filePath, file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      if (uploadError) {
        setRetryState(prev => ({
          attempts: prev.attempts,
          lastError: uploadError.message,
          operation: 'upload'
        }));
        throw uploadError;
      }
      const {
        data: fileData,
        error: dbError
      } = await supabase.from('files').insert({
        filename: file.name,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        path: filePath,
        profile_id: user.id
      }).select().single();
      if (dbError) {
        setRetryState(prev => ({
          attempts: prev.attempts,
          lastError: dbError.message,
          operation: 'upload'
        }));
        throw dbError;
      }
      if (fileData) {
        await triggerTextExtraction(fileData.id);
      }
      
      // Fallback cache invalidation to ensure file appears in UI
      // This acts as backup if real-time subscriptions fail
      queryClient.invalidateQueries({ queryKey: ['files', user.id] });
      queryClient.invalidateQueries({ queryKey: ['files-count', user.id] });

      resetRetryState();
      toast.success("Success", {
        description: "File uploaded and processed successfully. Embeddings will be generated automatically."
      });
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
        action: retryState.attempts < MAX_RETRY_ATTEMPTS ? {
          label: `Retry (${MAX_RETRY_ATTEMPTS - retryState.attempts} left)`,
          onClick: handleRetry
        } : undefined
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  };
  const handleChunkSizeChange = (value: number[]) => {
    setChunkingSettings(prev => ({
      ...prev,
      chunkSize: value[0]
    }));
  };
  const handleChunkOverlapChange = (value: number[]) => {
    setChunkingSettings(prev => ({
      ...prev,
      chunkOverlap: value[0]
    }));
  };
  const handleChunkSizeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setChunkingSettings(prev => ({
        ...prev,
        chunkSize: Math.min(Math.max(value, 100), 2000)
      }));
    }
  };
  const handleChunkOverlapInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setChunkingSettings(prev => ({
        ...prev,
        chunkOverlap: Math.min(Math.max(value, 0), 200)
      }));
    }
  };
  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div 
        className={`relative flex flex-col items-center justify-center w-full h-36 overflow-hidden border-2 border-dashed rounded-xl transition-all duration-200 ${
          dragActive 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/50'
        }`} 
        onDragOver={handleDragOver} 
        onDragLeave={handleDragLeave} 
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          id="file-upload" 
          className="hidden" 
          onChange={handleChange} 
          disabled={isLoading} 
          ref={inputRef} 
          accept=".pdf,.txt,.csv" 
        />
        <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
          <div className="flex flex-col items-center justify-center">
            <div className="mb-3 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full">
              <Upload className={`w-6 h-6 ${isLoading ? 'text-blue-600 animate-pulse' : 'text-blue-500'}`} />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-xs">
              {t('fileManagement.dragAndDrop')}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                <span>{t('fileManagement.fileTypes')}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                <span>{t('fileManagement.maxFileSize')}</span>
              </div>
            </div>
            {retryState.lastError && retryState.attempts > 0 && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                Retry attempt {retryState.attempts}/{MAX_RETRY_ATTEMPTS}
              </div>
            )}
          </div>
        </label>

        {isLoading && (
          <div className="absolute bottom-0 left-0 w-full px-6 pb-4">
            <Progress value={uploadProgress} className="h-2 bg-slate-200 dark:bg-slate-700" />
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <Collapsible open={showAdvancedSettings} onOpenChange={setShowAdvancedSettings}>
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <Cog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t('fileManagement.textChunkingSettings')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('fileManagement.configureProcessing')}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {showAdvancedSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-6 border-t border-slate-200 dark:border-slate-700 pt-4">
              {/* Chunk Size */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="chunk-size" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('fileManagement.chunkSize')}: {chunkingSettings.chunkSize} {t('fileManagement.tokens')}
                  </Label>
                  <Input
                    type="number"
                    id="chunk-size-input"
                    className="w-20 h-8 text-xs"
                    value={chunkingSettings.chunkSize}
                    onChange={handleChunkSizeInputChange}
                    min={100}
                    max={2000}
                  />
                </div>
                <Slider
                  id="chunk-size"
                  min={100}
                  max={2000}
                  step={16}
                  value={[chunkingSettings.chunkSize]}
                  onValueChange={handleChunkSizeChange}
                  className="w-full"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('fileManagement.chunkSizeDescription')}
                </p>
              </div>

              {/* Chunk Overlap */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="chunk-overlap" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('fileManagement.chunkOverlap')}: {chunkingSettings.chunkOverlap} {t('fileManagement.tokens')}
                  </Label>
                  <Input
                    type="number"
                    id="chunk-overlap-input"
                    className="w-20 h-8 text-xs"
                    value={chunkingSettings.chunkOverlap}
                    onChange={handleChunkOverlapInputChange}
                    min={0}
                    max={200}
                  />
                </div>
                <Slider
                  id="chunk-overlap"
                  min={0}
                  max={200}
                  step={8}
                  value={[chunkingSettings.chunkOverlap]}
                  onValueChange={handleChunkOverlapChange}
                  className="w-full"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('fileManagement.chunkOverlapDescription')}
                </p>
              </div>

              {/* Recommendations */}
              <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                  {t('fileManagement.recommendedSettings')}
                </h4>
                <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                  <div>{t('fileManagement.technicalDocuments')}</div>
                  <div>{t('fileManagement.narrativeContent')}</div>
                  <div>{t('fileManagement.shortFormContent')}</div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
