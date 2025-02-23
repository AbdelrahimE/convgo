import { useState, useRef } from "react";
import { Upload, AlertCircle } from "lucide-react";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileMetadataForm } from "@/components/FileMetadataForm";

interface UploadingFile {
  file: File;
  id?: string;
}

export function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<UploadingFile | null>(null);
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
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
        body: { fileId }
      });

      if (extractError) throw extractError;

    } catch (error: any) {
      console.error('Error in processing:', error);
      toast({
        variant: "destructive",
        title: "Processing Error",
        description: "Failed to process file. Please try again."
      });
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;
    if (!validateFile(file)) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      // Start a fake progress animation
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

      if (uploadError) throw uploadError;

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

      if (dbError) throw dbError;

      if (fileData) {
        // Store the file info temporarily and show metadata dialog
        setCurrentUploadingFile({ file, id: fileData.id });
        setShowMetadataDialog(true);

        // Trigger text extraction in parallel
        await triggerTextExtraction(fileData.id);
      }

      toast({
        title: "Success",
        description: "File uploaded successfully. Please add metadata."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    } finally {
      setIsUploading(false);
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
              animate={isUploading ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Upload className={`w-8 h-8 mb-2 sm:w-10 sm:h-10 md:w-12 md:h-12 ${isUploading ? 'text-primary' : ''}`} />
            </motion.div>
            <p className="mb-2 text-sm sm:text-base md:text-lg text-gray-500 text-center px-4">
              {dragActive
                ? "Drop the file here"
                : isUploading
                ? "Uploading..."
                : "Drag & drop or click to upload"}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm text-gray-500 text-center">PDF, DOC, DOCX, TXT, CSV (max 10MB)</p>
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

        {isUploading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-0 left-0 w-full px-4 pb-4"
          >
            <Progress value={uploadProgress} className="h-1" />
          </motion.div>
        )}
      </motion.div>

      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Add File Metadata</h2>
            {currentUploadingFile?.id && (
              <FileMetadataForm 
                fileId={currentUploadingFile.id}
                onSave={handleMetadataSave}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
