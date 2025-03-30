
import * as React from "react";
import { useState, useEffect } from "react";
import { useClientLanguageDetection } from "@/hooks/use-client-language-detection";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface LanguageAwareInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  defaultLanguage?: 'ar' | 'en' | 'auto';
}

const LanguageAwareInput = React.forwardRef<
  HTMLInputElement,
  LanguageAwareInputProps
>(({ className, defaultLanguage = 'auto', value, onChange, ...props }, ref) => {
  const { detectLanguage } = useClientLanguageDetection();
  const [detectedLang, setDetectedLang] = useState<'ar' | 'en' | 'auto'>(defaultLanguage);
  
  // Update language detection when value changes
  useEffect(() => {
    if (typeof value === 'string') {
      const detected = detectLanguage(value);
      setDetectedLang(detected);
    }
  }, [value, detectLanguage]);

  // Apply language-specific class
  const langClass = detectedLang === 'ar' ? 'lang-ar' : 
                   (detectedLang === 'en' ? 'lang-en' : '');
  
  // Handle direction automatically
  const directionClass = detectedLang === 'ar' ? 'direction-rtl' : 'direction-ltr';
  
  return (
    <Input
      ref={ref}
      className={cn(langClass, directionClass, className)}
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

LanguageAwareInput.displayName = "LanguageAwareInput";

export { LanguageAwareInput };
