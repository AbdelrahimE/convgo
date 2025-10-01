import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Headset, CheckCircle, Eye, ExternalLink, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { EscalatedConversation } from '@/hooks/use-escalation-queries';
import { useTranslation } from 'react-i18next';

interface ConversationItemProps {
  conversation: EscalatedConversation;
  onResolve: (conversationId: string, whatsappNumber: string, instanceId: string) => void;
  onViewContext: (conversation: EscalatedConversation) => void;
  getReasonBadge: (reason: string) => React.ReactNode;
  loading?: boolean;
}

const openWhatsApp = (phoneNumber: string) => {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleanNumber}`, '_blank');
};

export const ConversationItem = React.memo(({
  conversation,
  onResolve,
  onViewContext,
  getReasonBadge,
  loading = false
}: ConversationItemProps) => {
  const { t } = useTranslation();

  return (
    <div
      key={conversation.id}
      className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600"
    >
      {/* Mobile and Desktop Layout */}
      <div className="space-y-3">
        {/* First Row: Icon, Number, Badges, and Actions (Desktop) / Just Icon, Number, and Actions (Mobile) */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 flex-shrink-0">
              <Headset className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {conversation.whatsapp_number}
            </span>

            {/* Show badges on larger screens only */}
            <div className="hidden md:flex items-center gap-2">
              {getReasonBadge(conversation.reason)}
              {conversation.resolved_at && (
                <Badge className="bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-900 text-green-800 dark:text-green-200 font-medium">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {t('escalation.resolvedBadge')}
                </Badge>
              )}
            </div>
          </div>

          {/* Action buttons - always visible */}
          <div className="flex gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewContext(conversation)}
              className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={t('escalation.viewContext')}
            >
              <Eye className="h-3 w-3 text-slate-600 dark:text-slate-400" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openWhatsApp(conversation.whatsapp_number)}
              className="h-7 w-7 p-0 hover:bg-green-50 dark:hover:bg-green-900/20"
              title={t('escalation.openWhatsapp')}
            >
              <ExternalLink className="h-3 w-3 text-green-600 dark:text-green-400" />
            </Button>
            {!conversation.resolved_at && (
              <Button
                size="sm"
                onClick={() => onResolve(conversation.id, conversation.whatsapp_number, conversation.instance_id)}
                disabled={loading}
                className="h-7 px-2 text-xs"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">{t('escalation.resolve')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Second Row: Badges and Date Info (Mobile) / Just Date Info (Desktop) */}
        <div className="space-y-2">
          {/* Show badges on mobile only */}
          <div className="flex flex-wrap gap-2 md:hidden">
            {getReasonBadge(conversation.reason)}
            {conversation.resolved_at && (
              <Badge className="bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-900 text-green-800 dark:text-green-200 font-medium">
                <CheckCircle className="h-3 w-3 mr-1" />
                {t('escalation.resolvedBadge')}
              </Badge>
            )}
          </div>

          {/* Date information */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500" />
              <span className="font-normal">
                {t('escalation.escalated')} {format(new Date(conversation.escalated_at), 'dd/MM/yyyy h:mm a')}
              </span>
            </div>

            {conversation.resolved_at && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                <span className="font-normal">
                  {t('escalation.resolvedAt')} {format(new Date(conversation.resolved_at), 'dd/MM/yyyy h:mm a')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimization
  return prevProps.conversation.id === nextProps.conversation.id &&
         prevProps.conversation.resolved_at === nextProps.conversation.resolved_at &&
         prevProps.loading === nextProps.loading;
});