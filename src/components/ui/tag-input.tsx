import * as React from "react";
import { useState } from "react";
import { useClientLanguageDetection } from "@/hooks/use-client-language-detection";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxTags?: number;
}

const TagInput = React.forwardRef<HTMLDivElement, TagInputProps>(
  ({ value = [], onChange, placeholder, className, disabled = false, maxTags }, ref) => {
    const [inputValue, setInputValue] = useState("");
    const [isInputFocused, setIsInputFocused] = useState(false);
    const { detectLanguage } = useClientLanguageDetection();

    // Detect language of current input
    const detectedLang = detectLanguage(inputValue);
    const directionClass = detectedLang === 'ar' ? 'direction-rtl' : 'direction-ltr';

    const addTag = (tagText: string) => {
      const trimmedTag = tagText.trim();
      if (trimmedTag && !value.includes(trimmedTag)) {
        if (maxTags && value.length >= maxTags) return;
        onChange([...value, trimmedTag]);
      }
      setInputValue("");
    };

    const removeTag = (indexToRemove: number) => {
      onChange(value.filter((_, index) => index !== indexToRemove));
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        // Remove last tag when backspacing with empty input
        removeTag(value.length - 1);
      }
    };

    const handleInputBlur = () => {
      setIsInputFocused(false);
      // Optionally add tag on blur if there's content
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        onClick={() => !disabled && document.getElementById("tag-input")?.focus()}
      >
        <div className="flex flex-wrap gap-1 w-full">
          {/* Render existing tags */}
          {value.map((tag, index) => {
            const tagLang = detectLanguage(tag);
            const tagDirectionClass = tagLang === 'ar' ? 'direction-rtl' : 'direction-ltr';
            
            return (
              <Badge
                key={index}
                variant="secondary"
                className={cn(
                  "flex items-center gap-1 text-xs font-normal",
                  tagDirectionClass,
                  tagLang === 'ar' ? 'font-arabic' : ''
                )}
              >
                <span>{tag}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(index);
                    }}
                    className="ml-1 h-3 w-3 rounded-full hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
          
          {/* Input for adding new tags */}
          <Input
            id="tag-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setIsInputFocused(true)}
            onBlur={handleInputBlur}
            placeholder={value.length === 0 ? placeholder : ""}
            disabled={disabled || (maxTags ? value.length >= maxTags : false)}
            className={cn(
              "border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 min-w-[120px]",
              directionClass,
              detectedLang === 'ar' ? 'font-arabic' : ''
            )}
            style={{ 
              backgroundColor: 'transparent',
              boxShadow: 'none',
              minWidth: inputValue ? `${Math.max(inputValue.length * 8, 120)}px` : '120px'
            }}
          />
        </div>
      </div>
    );
  }
);

TagInput.displayName = "TagInput";

export { TagInput };