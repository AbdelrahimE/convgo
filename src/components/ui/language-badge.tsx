import * as React from "react";
import { cn } from "@/lib/utils";

interface LanguageBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  language: string | null;
}

const getLanguageColor = (language: string | null) => {
  if (!language) return "bg-gray-100 text-gray-800 border-gray-200";
  
  const colors: Record<string, string> = {
    'arabic': 'bg-green-100 text-green-800 border-green-200',
    'english': 'bg-blue-100 text-blue-800 border-blue-200',
    'french': 'bg-purple-100 text-purple-800 border-purple-200',
    'spanish': 'bg-orange-100 text-orange-800 border-orange-200',
  };
  
  return colors[language.toLowerCase()] || 'bg-slate-100 text-slate-800 border-slate-200';
};

const LanguageBadge = React.forwardRef<HTMLDivElement, LanguageBadgeProps>(
  ({ className, language, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          getLanguageColor(language),
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

LanguageBadge.displayName = "LanguageBadge";

export { LanguageBadge, getLanguageColor };