
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

interface TextProcessingResult {
  success: boolean;
  fileId?: string;
  stats?: {
    chunks: number;
    averageChunkSize: number;
    processingTime: string;
    originalSize: number;
    processedSize: number;
  };
  error?: string;
}

export function useTextProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const processDocumentText = async (fileId: string): Promise<TextProcessingResult> => {
    if (!fileId) {
      toast({
        variant: "destructive",
        title: "Missing file ID",
        description: "A file ID is required to process document text"
      });
      return { success: false, error: "Missing file ID" };
    }

    setIsProcessing(true);
    setProgress(10);

    try {
      // Start text processing via edge function
      const { data, error } = await supabase.functions.invoke("process-document-text", {
        body: { fileId },
      });

      setProgress(90);

      if (error) {
        console.error("Error processing document text:", error);
        toast({
          variant: "destructive",
          title: "Processing Failed",
          description: error.message || "Failed to process document text"
        });
        return { success: false, error: error.message };
      }

      setProgress(100);

      // Show success message with statistics
      toast({
        title: "Document Processed",
        description: `Created ${data.stats.chunks} chunks with avg size of ${Math.round(data.stats.averageChunkSize)} chars`
      });

      return { 
        success: true,
        fileId: data.fileId,
        stats: data.stats
      };
    } catch (error: any) {
      console.error("Exception in text processing:", error);
      toast({
        variant: "destructive",
        title: "Processing Error",
        description: error.message || "An unexpected error occurred"
      });
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
      // Reset progress after a short delay
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return {
    processDocumentText,
    isProcessing,
    progress
  };
}
