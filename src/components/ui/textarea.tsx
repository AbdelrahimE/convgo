
import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  // Add additional properties for auto-expanding
  autoExpand?: boolean;
  minRows?: number;
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoExpand, minRows, maxRows, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const combinedRef = React.useMergeRefs ? 
      React.useMergeRefs([textareaRef, ref]) : 
      (node: HTMLTextAreaElement) => {
        textareaRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      };

    // Auto-expand functionality
    const adjustHeight = React.useCallback(() => {
      if (!autoExpand || !textareaRef.current) return;
      
      const textarea = textareaRef.current;
      
      // Reset height to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate the proper height with limits
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
      const defaultMinRows = minRows || 3;
      const defaultMaxRows = maxRows || 8;
      const minHeight = lineHeight * defaultMinRows;
      const maxHeight = lineHeight * defaultMaxRows;
      
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      
      textarea.style.height = `${newHeight}px`;
      
      // Show/hide scrollbar if content exceeds maxHeight
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [autoExpand, minRows, maxRows]);
    
    // Adjust height on mount and when content changes
    React.useEffect(() => {
      if (autoExpand) {
        adjustHeight();
        
        // Add resize observer to handle window or content changes
        const resizeObserver = new ResizeObserver(() => {
          adjustHeight();
        });
        
        if (textareaRef.current) {
          resizeObserver.observe(textareaRef.current);
        }
        
        return () => {
          if (textareaRef.current) {
            resizeObserver.unobserve(textareaRef.current);
          }
          resizeObserver.disconnect();
        };
      }
    }, [adjustHeight, autoExpand, props.value]);
    
    // Handle input events to adjust height
    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      if (autoExpand) {
        adjustHeight();
      }
    };

    const autoExpandClass = autoExpand ? 'resize-none' : '';
    
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          autoExpandClass,
          className
        )}
        ref={combinedRef}
        onInput={handleInput}
        {...props}
      />
    )
  }
)

// Add a useMergeRefs helper if not available globally
if (!React.useMergeRefs) {
  React.useMergeRefs = (refs: React.Ref<any>[]) => {
    return (instance: any) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref != null) {
          (ref as React.MutableRefObject<any>).current = instance;
        }
      });
    };
  };
}

Textarea.displayName = "Textarea"

export { Textarea }
