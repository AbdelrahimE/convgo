import * as React from "react";
import { cn } from "@/lib/utils";

interface CategoryBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  category: string;
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'error': 'bg-red-100 text-red-800 border-red-200',
    'warning': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'info': 'bg-blue-100 text-blue-800 border-blue-200',
    'debug': 'bg-gray-100 text-gray-800 border-gray-200',
    'success': 'bg-green-100 text-green-800 border-green-200',
    'network': 'bg-purple-100 text-purple-800 border-purple-200',
    'database': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'auth': 'bg-orange-100 text-orange-800 border-orange-200',
    'webhook': 'bg-teal-100 text-teal-800 border-teal-200',
    'ai': 'bg-pink-100 text-pink-800 border-pink-200',
  };
  
  return colors[category.toLowerCase()] || 'bg-slate-100 text-slate-800 border-slate-200';
};

const CategoryBadge = React.forwardRef<HTMLDivElement, CategoryBadgeProps>(
  ({ className, category, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          getCategoryColor(category),
          className
        )}
        {...props}
      >
        {children || category}
      </div>
    );
  }
);

CategoryBadge.displayName = "CategoryBadge";

export { CategoryBadge, getCategoryColor };