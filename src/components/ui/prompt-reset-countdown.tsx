
import React from 'react';
import { Card, CardContent } from './card';
import { Clock } from 'lucide-react';

interface PromptResetCountdownProps {
  timeUntilReset: {
    days: number;
    hours: number;
    minutes: number;
  } | null;
  className?: string;
}

export function PromptResetCountdown({ timeUntilReset, className = '' }: PromptResetCountdownProps) {
  if (!timeUntilReset) return null;

  const formatTime = (days: number, hours: number, minutes: number) => {
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Clock className="h-4 w-4" />
      <span>
        Resets in: {formatTime(timeUntilReset.days, timeUntilReset.hours, timeUntilReset.minutes)}
      </span>
    </div>
  );
}
