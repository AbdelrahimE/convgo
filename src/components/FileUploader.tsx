import { useState, useRef } from "react";
import { Upload, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileMetadataForm } from "@/components/FileMetadataForm";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface UploadingFile {
  file: File;
  id?: string;
}

interface RetryState {
  attempts: number;
  lastError: string | null;
  operation: 'upload' | 'metadata' | 'extraction';
}

interface ChunkingSettings {
  chunkSize: number;
  chunkOverlap: number;
  splitBySentence?: boolean;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<UploadingFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [chunkingSettings, setChunkingSettings] = useState<ChunkingSettings>({
    chunkSize: 768,
    chunkOverlap: 80
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ];
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

  const handleRetry = async () => {
    if (retryState.attempts >= MAX_RETRY_ATTEMPTS) {
      toast({
        variant: "destructive",
        title: "Maximum retry attempts reached",
        description: "Please try uploading the file again"
      });
      resetRetryState();
      return;
    }

    setRetryState(prev => ({
      ...prev,
      attempts: prev.attempts + 1
    }));

    await sleep(RETRY_DELAY_MS * Math.pow(2, retryState.attempts));

    switch (retryState.operation) {
      case 'upload':
        if (currentUploadingFile?.file) {
          await handleFileUpload(currentUploadingFile.file);
        }
        break;
      case 'metadata':
        if (currentUploadingFile?.id) {
          await triggerTextExtraction(currentUploadingFile.id);
        }
        break;
      case 'extraction':
        if (currentUploadingFile?.id) {
          await triggerTextExtraction(currentUploadingFile.id);
        }
        break;
    }
  };

  const validateFile = (file: File) => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload a PDF, DOC, DOCX, TXT, or CSV file"
      });
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "File size should be less than 10MB"
      });
      return false;
    }

    return true;
  };

  const triggerTextExtraction = async (fileId: string) => {
    try {
      const { error: extractError } = await supabase.functions.invoke('extract-text', {
        body: { 
          fileId,
          chunkingSettings: {
            chunkSize: chunkingSettings.chunkSize,
            chunkOverlap: chunkingSettings.chunkOverlap,
            splitBySentence: true
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

      resetRetryState();

    } catch (error: any) {
      console.error('Error in processing:', error);
      toast({
        variant: "destructive",
        title: "Processing Error",
        description: "Failed to process file. Click retry to attempt again.",
        action: retryState.attempts < MAX_RETRY_ATTEMPTS ? (
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry ({MAX_RETRY_ATTEMPTS - retryState.attempts} left)
          </Button>
        ) : undefined
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

      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, file);

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

      const { data: fileData, error: dbError } = await supabase
        .from('files')
        .insert({
          filename: file.name,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          path: filePath,
          profile_id: user.id
        })
        .select()
        .single();

      if (dbError) {
        setRetryState(prev => ({
          attempts: prev.attempts,
          lastError: dbError.message,
          operation: 'metadata'
        }));
        throw dbError;
      }

      if (fileData) {
        setCurrentUploadingFile({ file, id: fileData.id });
        setShowMetadataDialog(true);
        await triggerTextExtraction(fileData.id);
      }

      resetRetryState();
      toast({
        title: "Success",
        description: "File uploaded successfully. Please add metadata."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
        action: retryState.attempts < MAX_RETRY_ATTEMPTS ? (
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry ({MAX_RETRY_ATTEMPTS - retryState.attempts} left)
          </Button>
        ) : undefined
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleMetadataSave = () => {
    setShowMetadataDialog(false);
    setCurrentUploadingFile(null);
    toast({
      title: "Success",
      description: "File metadata saved successfully"
    });
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
    setChunkingSettings(prev => ({ ...prev, chunkSize: value[0] }));
  };

  const handleChunkOverlapChange = (value: number[]) => {
    setChunkingSettings(prev => ({ ...prev, chunkOverlap: value[0] }));
  };

  const handleChunkSizeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setChunkingSettings(prev => ({ ...prev, chunkSize: Math.min(Math.max(value, 100), 2000) }));
    }
  };

  const handleChunkOverlapInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setChunkingSettings(prev => ({ ...prev, chunkOverlap: Math.min(Math.max(value, 0), 200) }));
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ scale: dragActive ? 1 : 1.01 }}
        transition={{ duration: 0.2 }}
        className={`relative flex flex-col items-center justify-center w-full h-32 sm:h-40 md:h-48 border-2 border-dashed rounded-lg transition-all duration-200
          ${dragActive ? 'border-primary bg-primary/10 scale-102' : 'border-gray-300 hover:border-primary'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          onChange={handleChange}
          disabled={isUploading}
          ref={inputRef}
          accept=".pdf,.doc,.docx,.txt,.csv"
        />
        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <motion.div
              animate={isLoading ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Upload className={`w-8 h-8 mb-2 sm:w-10 sm:h-10 md:w-12 md:h-12 ${isLoading ? 'text-primary' : ''}`} />
            </motion.div>
            <p className="mb-2 text-sm sm:text-base md:text-lg text-gray-500 text-center px-4">
              {dragActive
                ? "Drop the file here"
                : isLoading
                ? "Uploading..."
                : "Drag & drop or click to upload"}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm text-gray-500 text-center">
                PDF, DOC, DOCX, TXT, CSV (max 10MB)
                {retryState.lastError && retryState.attempts > 0 && (
                  <span className="text-destructive ml-2">
                    Retry attempt {retryState.attempts}/{MAX_RETRY_ATTEMPTS}
                  </span>
                )}
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Files will be validated for:</p>
                    <ul className="text-xs mt-1 list-disc pl-4">
                      <li>UTF-8 encoding</li>
                      <li>Text content presence</li>
                      <li>Character set compatibility</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </label>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-0 left-0 w-full px-4 pb-4"
          >
            <Progress value={uploadProgress} className="h-1" />
          </motion.div>
        )}
      </motion.div>

      <Collapsible
        open={showAdvancedSettings}
        onOpenChange={setShowAdvancedSettings}
        className="mt-4 border rounded-md p-4 w-full"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-medium">Advanced Text Chunking Settings</h3>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {showAdvancedSettings ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-2 space-y-4">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between">
                <Label htmlFor="chunk-size">Chunk Size (tokens): {chunkingSettings.chunkSize}</Label>
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
              <div className="pt-2">
                <Slider 
                  id="chunk-size"
                  min={100} 
                  max={2000} 
                  step={16} 
                  value={[chunkingSettings.chunkSize]} 
                  onValueChange={handleChunkSizeChange}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Controls how large each text chunk will be. Larger chunks (768-1024) provide more context but may be less precise. 
                Smaller chunks (256-512) are more precise but may miss broader context.
              </p>
            </div>

            <div>
              <div className="flex justify-between">
                <Label htmlFor="chunk-overlap">Chunk Overlap (tokens): {chunkingSettings.chunkOverlap}</Label>
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
              <div className="pt-2">
                <Slider 
                  id="chunk-overlap"
                  min={0} 
                  max={200} 
                  step={8} 
                  value={[chunkingSettings.chunkOverlap]} 
                  onValueChange={handleChunkOverlapChange}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Controls how much text overlaps between chunks. Higher overlap (60-100) preserves context between chunks 
                but creates more redundancy. Lower values (20-40) reduce redundancy but may cause context loss.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
            <p className="text-xs text-blue-700">
              <strong>Recommended settings by document type:</strong><br/>
              • Technical/Reference: 512-768 chunk size, 40-60 overlap<br/>
              • Narrative/Conversational: 768-1024 chunk size, 80-100 overlap<br/>
              • Short Form Content: 256-512 chunk size, 20-40 overlap
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] p-6">
          <DialogHeader>
            <DialogTitle>Add File Metadata</DialogTitle>
            <DialogDescription>
              Please provide the metadata for your uploaded file. This information will help organize and search your documents.
            </DialogDescription>
          </DialogHeader>
          {currentUploadingFile?.id && (
            <FileMetadataForm 
              fileId={currentUploadingFile.id}
              onSave={handleMetadataSave}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
