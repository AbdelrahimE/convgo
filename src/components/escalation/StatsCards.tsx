import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Clock, MessageCircle } from 'lucide-react';

interface Stats {
  total: number;
  active: number;
  resolved: number;
  avgResolutionTime: number;
}

interface StatsCardsProps {
  stats: Stats;
}

export const StatsCards = React.memo(({ stats }: StatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active Conversations Card */}
      <Card className="rounded-lg bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 border-red-200/50 dark:border-red-800/50 transition-colors duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">Active Conversations</h3>
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-red-700 dark:text-red-300">{stats.active}</p>
                <p className="text-xs font-normal text-red-600/70 dark:text-red-400/70">Require Attention</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resolved Today Card */}
      <Card className="rounded-lg bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/50 dark:to-green-900/30 border-green-200/50 dark:border-green-800/50 transition-colors duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">Resolved Today</h3>
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-green-700 dark:text-green-300">{stats.resolved}</p>
                <p className="text-xs font-normal text-green-600/70 dark:text-green-400/70">Successfully Handled</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Resolution Time Card */}
      <Card className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200/50 dark:border-blue-800/50 transition-colors duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Avg Resolution Time</h3>
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-blue-700 dark:text-blue-300">{stats.avgResolutionTime}<span className="text-lg font-medium ml-1">min</span></p>
                <p className="text-xs font-normal text-blue-600/70 dark:text-blue-400/70">Response Efficiency</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Escalations Card */}
      <Card className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200/50 dark:border-purple-800/50 transition-colors duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">Total Escalations</h3>
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-purple-700 dark:text-purple-300">{stats.total}</p>
                <p className="text-xs font-normal text-purple-600/70 dark:text-purple-400/70">All Time Count</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50">
              <MessageCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});