
import { useState } from "react";
import { SplitSquareHorizontal, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTextProcessing } from "@/hooks/use-text-processing";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TextProcessingButtonProps {
  fileId: string;
  disabled?: boolean;
  onProcessComplete?: (success: boolean) => void;
  className?: string;
}

export function TextProcessingButton({
  fileId,
  disabled = false,
  onProcessComplete,
  className,
}: TextProcessingButtonProps) {
  const { processDocumentText, isProcessing, progress } = useTextProcessing();
  const [processingState, setProcessingState] = useState<"idle" | "processing" | "success" | "error">("idle");

  const handleProcessText = async () => {
    if (isProcessing || disabled) return;

    setProcessingState("processing");
    const result = await processDocumentText(fileId);
    
    if (result.success) {
      setProcessingState("success");
      onProcessComplete?.(true);
      
      // Reset success state after 3 seconds
      setTimeout(() => {
        setProcessingState("idle");
      }, 3000);
    } else {
      setProcessingState("error");
      onProcessComplete?.(false);
      
      // Reset error state after 3 seconds
      setTimeout(() => {
        setProcessingState("idle");
      }, 3000);
    }
  };

  return (
    <div className="relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={processingState === "error" ? "destructive" : "outline"}
              size="sm"
              disabled={isProcessing || disabled}
              onClick={handleProcessText}
              className={className}
            >
              {processingState === "processing" ? (
                <SplitSquareHorizontal className="h-4 w-4 mr-2 animate-pulse" />
              ) : processingState === "success" ? (
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              ) : processingState === "error" ? (
                <AlertCircle className="h-4 w-4 mr-2" />
              ) : (
                <SplitSquareHorizontal className="h-4 w-4 mr-2" />
              )}
              {processingState === "processing"
                ? "Processing..."
                : processingState === "success"
                ? "Processed"
                : processingState === "error"
                ? "Failed"
                : "Process Text"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {processingState === "processing"
                ? "Processing document text into chunks..."
                : processingState === "success"
                ? "Document processed successfully"
                : processingState === "error"
                ? "Error processing document"
                : "Process document text into chunks for embedding"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isProcessing && (
        <div className="absolute left-0 bottom-0 w-full transform translate-y-1">
          <Progress value={progress} className="h-1" />
        </div>
      )}
    </div>
  );
}
