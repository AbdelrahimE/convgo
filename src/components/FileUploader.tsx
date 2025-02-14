
import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";

export function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
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

  const handleUpload = async (file: File) => {
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

      const { error: dbError } = await supabase
        .from('files')
        .insert({
          filename: file.name,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          path: filePath,
          profile_id: user.id
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File uploaded successfully"
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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUpload(e.dataTransfer.files[0]);
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
      await handleUpload(file);
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors
        ${dragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary'}
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
          <Upload className={`w-8 h-8 mb-2 ${isUploading ? 'text-primary animate-pulse' : ''}`} />
          <p className="mb-2 text-sm text-gray-500">
            {dragActive
              ? "Drop the file here"
              : isUploading
              ? "Uploading..."
              : "Drag & drop or click to upload"}
          </p>
          <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT, CSV (max 10MB)</p>
        </div>
      </label>

      {isUploading && (
        <div className="absolute bottom-0 left-0 w-full px-4 pb-4">
          <Progress value={uploadProgress} className="h-1" />
        </div>
      )}
    </div>
  );
}
