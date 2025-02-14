
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, file);

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
      event.target.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleFileUpload}
        disabled={isUploading}
      />
      <label htmlFor="file-upload">
        <Button asChild disabled={isUploading}>
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload File"}
          </span>
        </Button>
      </label>
    </div>
  );
}
