import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useEscalatedConversations, useResolveEscalation, EscalatedConversation } from '@/hooks/use-escalation-queries';
import { StatsCards } from './StatsCards';
import { ConversationItem } from './ConversationItem';
import { useAuth } from '@/contexts/AuthContext';

interface Stats {
  total: number;
  active: number;
  resolved: number;
  avgResolutionTime: number;
}

interface ConversationsTabProps {
  selectedInstance: string;
  filter: 'all' | 'active' | 'resolved';
  onFilterChange: (filter: 'all' | 'active' | 'resolved') => void;
  onViewContext: (conversation: EscalatedConversation) => void;
}

export const ConversationsTab = React.memo(({ 
  selectedInstance,
  filter,
  onFilterChange,
  onViewContext
}: ConversationsTabProps) => {
  const { user } = useAuth();
  const { data: conversations = [], isLoading, refetch } = useEscalatedConversations(selectedInstance, filter);
  const resolveEscalationMutation = useResolveEscalation();

  // Calculate stats from conversations
  const stats: Stats = useMemo(() => {
    if (!conversations.length) {
      return { total: 0, active: 0, resolved: 0, avgResolutionTime: 0 };
    }

    const active = conversations.filter(c => !c.resolved_at).length;
    const resolved = conversations.filter(c => c.resolved_at).length;
    
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    conversations.forEach(conv => {
      if (conv.resolved_at) {
        const escalatedTime = new Date(conv.escalated_at).getTime();
        const resolvedTime = new Date(conv.resolved_at).getTime();
        totalResolutionTime += (resolvedTime - escalatedTime) / (1000 * 60); // in minutes
        resolvedCount++;
      }
    });

    return {
      total: conversations.length,
      active,
      resolved,
      avgResolutionTime: resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0
    };
  }, [conversations]);

  // Memoized reason badge function
  const getReasonBadge = useCallback((reason: string) => {
    switch (reason) {
      case 'ai_detected_intent':
        return <Badge className="bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium">Smart AI Detection</Badge>;
      case 'user_request':
        return <Badge className="bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium">Keyword Triggered</Badge>;
      default:
        return <Badge className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium">Unknown Reason</Badge>;
    }
  }, []);

  // Handle resolve escalation
  const handleResolveEscalation = useCallback((conversationId: string, whatsappNumber: string, instanceId: string) => {
    if (!user?.id) return;

    resolveEscalationMutation.mutate({
      phoneNumber: whatsappNumber,
      instanceId: instanceId,
      resolvedBy: user.id
    });
  }, [user?.id, resolveEscalationMutation]);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            onClick={() => onFilterChange('active')}
            size="sm"
          >
            Active
          </Button>
          <Button
            variant={filter === 'resolved' ? 'default' : 'outline'}
            onClick={() => onFilterChange('resolved')}
            size="sm"
          >
            Resolved
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => onFilterChange('all')}
            size="sm"
          >
            All
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <StatsCards stats={stats} />

      {/* Conversations List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Escalated Conversations List</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manage and track conversations that have been escalated to human support
            </p>
          </div>
          
          <div>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-slate-600 dark:text-slate-400">Loading...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-slate-500 dark:text-slate-600" />
                <p className="text-slate-600 dark:text-slate-400">
                  No Escalated Conversations {filter !== 'all' ? `(${filter === 'active' ? 'active' : 'resolved'})` : ''}
                </p>
              </div>
            ) : (
              // Regular list - Virtual scrolling can be added later when needed for large datasets
              <div className="space-y-4">
                {conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    onResolve={handleResolveEscalation}
                    onViewContext={onViewContext}
                    getReasonBadge={getReasonBadge}
                    loading={resolveEscalationMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});