
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

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Clock className="h-4 w-4" />
      <span>
        Resets in: {timeUntilReset.days > 0 ? `${timeUntilReset.days}d ` : ''}
        {timeUntilReset.hours > 0 ? `${timeUntilReset.hours}h ` : ''}
        {timeUntilReset.minutes}m
      </span>
    </div>
  );
}
