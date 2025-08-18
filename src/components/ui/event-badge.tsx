import * as React from "react";
import { cn } from "@/lib/utils";

interface EventBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  event: string;
}

const getEventColor = (event: string) => {
  const colors: Record<string, string> = {
    'messages.upsert': 'bg-blue-100 text-blue-800 border-blue-200',
    'messages.update': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'messages.delete': 'bg-red-100 text-red-800 border-red-200',
    'presence.update': 'bg-green-100 text-green-800 border-green-200',
    'chats.upsert': 'bg-purple-100 text-purple-800 border-purple-200',
    'chats.update': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'chats.delete': 'bg-pink-100 text-pink-800 border-pink-200',
    'contacts.upsert': 'bg-teal-100 text-teal-800 border-teal-200',
    'contacts.update': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'groups.upsert': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'connection.update': 'bg-slate-100 text-slate-800 border-slate-200',
    'call': 'bg-orange-100 text-orange-800 border-orange-200',
  };
  
  return colors[event] || 'bg-gray-100 text-gray-800 border-gray-200';
};

const EventBadge = React.forwardRef<HTMLDivElement, EventBadgeProps>(
  ({ className, event, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          getEventColor(event),
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

EventBadge.displayName = "EventBadge";

export { EventBadge, getEventColor };