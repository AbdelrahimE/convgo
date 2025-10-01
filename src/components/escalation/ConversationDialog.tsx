import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { EscalatedConversation } from '@/hooks/use-escalation-queries';
import { useTranslation } from 'react-i18next';

interface ConversationDialogProps {
  conversation: EscalatedConversation | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  getReasonBadge: (reason: string) => React.ReactNode;
  onResolve: (conversationId: string, whatsappNumber: string, instanceId: string) => void;
  loading?: boolean;
}

const openWhatsApp = (phoneNumber: string) => {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleanNumber}`, '_blank');
};

const hasArabicText = (text: string) => {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
};

export const ConversationDialog = React.memo(({
  conversation,
  isOpen,
  onOpenChange,
  getReasonBadge,
  onResolve,
  loading = false
}: ConversationDialogProps) => {
  const { t } = useTranslation();

  if (!conversation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] border-none flex flex-col">
        {/* Header Section - Fixed */}
        <div className="flex-shrink-0 pb-4">
          <DialogHeader className="py-4 px-0">
            <DialogTitle className="text-left">{t('escalation.conversationContext')}</DialogTitle>
            <DialogDescription className="text-left">
              {t('escalation.lastMessagesBeforeEscalation')}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-900 font-medium dark:text-slate-400">{t('escalation.number')}</span>{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{conversation.whatsapp_number}</span>
              </div>
              <div>
                <span className="text-slate-900 font-medium dark:text-slate-400">{t('escalation.reason')}</span>{' '}
                {getReasonBadge(conversation.reason)}
              </div>
              <div>
                <span className="text-slate-900 font-medium dark:text-slate-400">{t('escalation.escalatedAt')}</span>{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {format(new Date(conversation.escalated_at), 'dd/MM/yyyy h:mm a')}
                </span>
              </div>
              {conversation.resolved_at && (
                <div>
                  <span className="text-slate-900 font-medium dark:text-slate-400">{t('escalation.resolvedAtLabel')}</span>{' '}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {format(new Date(conversation.resolved_at), 'dd/MM/yyyy h:mm a')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Section - Scrollable */}
        <div className="flex-1 overflow-y-auto">
            <h4 className="font-semibold">{t('escalation.conversation')}</h4>
            {conversation.conversation_context && conversation.conversation_context.length > 0 ? (
              <div className="space-y-2 rounded-lg p-4">
                {conversation.conversation_context.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-100 dark:bg-blue-900 ml-auto max-w-[70%]'
                        : 'bg-slate-100 dark:bg-slate-700 mr-auto max-w-[70%]'
                    }`}
                  >
                    <p className="text-sm font-medium mb-1 text-slate-900 dark:text-slate-100">
                      {msg.role === 'user' ? t('escalation.customer') : t('escalation.aiAssistant')}
                    </p>
                    <p className={`text-sm text-slate-800 dark:text-slate-200 ${hasArabicText(msg.content) ? 'lang-ar' : ''}`}>
                      {msg.content}
                    </p>
                    {msg.timestamp && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {format(new Date(msg.timestamp), 'HH:mm')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 dark:text-slate-400 text-center py-4">{t('escalation.noConversationContext')}</p>
            )}
        </div>

        {/* Footer Section - Fixed */}
        <div className="flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => openWhatsApp(conversation.whatsapp_number)}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              {t('escalation.openInWhatsapp')}
            </Button>
            {!conversation.resolved_at && (
              <Button
                onClick={() => onResolve(
                  conversation.id,
                  conversation.whatsapp_number,
                  conversation.instance_id
                )}
                disabled={loading}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t('escalation.markResolved')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});