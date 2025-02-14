
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';

interface FileUploaderProps {
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploader({ onUploadStart, onUploadEnd, onSuccess, onError }: FileUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      onError(new Error('File type not supported'));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      onError(new Error('File size exceeds 10MB limit'));
      return;
    }

    try {
      onUploadStart();
      setUploadProgress(0);

      const fileExt = file.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;

      // First, get the current user's ID
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Authentication required');
      }

      // Create a custom upload handler to track progress
      const upload = new XMLHttpRequest();
      
      upload.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress(progress);
        }
      };

      const { error: uploadError } = await supabase.storage
        .from('user_files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('files').insert({
        filename: filePath,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        path: filePath,
        profile_id: user.id
      });

      if (dbError) throw dbError;

      onSuccess();
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Upload failed'));
    } finally {
      onUploadEnd();
      setUploadProgress(0);
    }
  }, [onUploadStart, onUploadEnd, onSuccess, onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 transition-colors duration-200
          ${isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          {isDragActive ? (
            <Upload className="h-8 w-8 animate-bounce text-primary" />
          ) : (
            <File className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="space-y-1">
            <p className="font-medium">
              {isDragActive ? 'Drop the file here' : 'Drag & drop a file here'}
            </p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </div>
        </div>
      </div>

      {uploadProgress > 0 && (
        <div className="space-y-2">
          <Progress value={uploadProgress} />
          <p className="text-sm text-center text-muted-foreground">
            Uploading... {Math.round(uploadProgress)}%
          </p>
        </div>
      )}
    </div>
  );
}
