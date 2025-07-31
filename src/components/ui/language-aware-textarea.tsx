
import * as React from "react";
import { useState, useEffect } from "react";
import { useClientLanguageDetection } from "@/hooks/use-client-language-detection";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useMergeRefs } from "@/hooks/use-merge-refs";

export interface LanguageAwareTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  defaultLanguage?: 'ar' | 'en' | 'auto';
  autoExpand?: boolean;
  minRows?: number;
  maxRows?: number;
}

const LanguageAwareTextarea = React.forwardRef<
  HTMLTextAreaElement,
  LanguageAwareTextareaProps
>(({ 
  className, 
  defaultLanguage = 'auto', 
  value, 
  onChange, 
  autoExpand = false,
  minRows = 3,
  maxRows = 8,
  ...props 
}, ref) => {
  const { detectLanguage } = useClientLanguageDetection();
  const [detectedLang, setDetectedLang] = useState<'ar' | 'en' | 'auto'>(defaultLanguage);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const combinedRef = useMergeRefs([textareaRef, ref]);
  
  // Update language detection when value changes
  useEffect(() => {
    if (typeof value === 'string') {
      const detected = detectLanguage(value);
      setDetectedLang(detected);
    }
  }, [value, detectLanguage]);

  // Auto-expand functionality
  const adjustHeight = React.useCallback(() => {
    if (!autoExpand || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    
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
  }, [autoExpand, minRows, maxRows]);
  
  // Adjust height on mount and when value changes
  React.useEffect(() => {
    adjustHeight();
  }, [adjustHeight, value]);
  
  // Apply language-specific class
  const langClass = detectedLang === 'ar' ? 'lang-ar' : 
                   (detectedLang === 'en' ? 'lang-en' : '');
  
  // Handle direction automatically
  const directionClass = detectedLang === 'ar' ? 'direction-rtl' : 'direction-ltr';
  
  // Add autoExpand styles if enabled
  const expandClass = autoExpand ? 'resize-none overflow-hidden' : '';
  
  return (
    <Textarea
      ref={combinedRef}
      className={cn(langClass, directionClass, expandClass, className)}
      value={value}
      onChange={(e) => {
        if (onChange) {
          onChange(e);
        }
        // Update language when text changes
        const detected = detectLanguage(e.target.value);
        setDetectedLang(detected);
      }}
      {...props}
    />
  );
});

LanguageAwareTextarea.displayName = "LanguageAwareTextarea";

export { LanguageAwareTextarea };
