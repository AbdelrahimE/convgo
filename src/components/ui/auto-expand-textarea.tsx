
import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useMergeRefs } from "@/hooks/use-merge-refs";

export interface AutoExpandTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
  maxRows?: number;
}

const AutoExpandTextarea = React.forwardRef<HTMLTextAreaElement, AutoExpandTextareaProps>(
  ({ className, minRows = 3, maxRows = 8, value, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const combinedRef = useMergeRefs([textareaRef, ref]);
    
    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      // Reset height to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate the proper height with limits
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
      const minHeight = lineHeight * minRows;
      const maxHeight = lineHeight * maxRows;
      
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      
      textarea.style.height = `${newHeight}px`;
      
      // Show/hide scrollbar if content exceeds maxHeight
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [minRows, maxRows]);
    
    // Adjust height on mount and when value changes
    React.useEffect(() => {
      adjustHeight();
    }, [adjustHeight, value]);
    
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) {
        onChange(e);
      }
      // Let the effect handle height adjustment after value change
    };
    
    return (
      <Textarea
        ref={combinedRef}
        className={cn("resize-none overflow-hidden", className)}
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

AutoExpandTextarea.displayName = "AutoExpandTextarea";

export { AutoExpandTextarea };
