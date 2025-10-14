import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ExternalActionForm from '@/components/external-actions/ExternalActionForm';

interface ExternalAction {
  id: string;
  user_id: string;
  whatsapp_instance_id: string;
  action_name: string;
  display_name: string;
  training_examples: Array<{
    text: string;
    language: string;
  }>;
  webhook_url: string;
  http_method: string;
  headers: Record<string, any>;
  payload_template: Record<string, any>;
  variable_prompts: Record<string, string>;
  confidence_threshold: number;
  is_active: boolean;
  retry_attempts: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  // V2 fields
  response_type?: 'none' | 'simple_confirmation' | 'custom_message' | 'wait_for_webhook';
  confirmation_message?: string;
  wait_for_response?: boolean;
  response_timeout_seconds?: number;
  response_language?: 'ar' | 'en' | 'fr' | 'es' | 'de';
}

const EditExternalAction: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [action, setAction] = useState<ExternalAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id && user) {
      loadActionData();
    }
  }, [id, user]);

  const loadActionData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('external_actions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      
      if (!data) {
        setError(t('externalActions.failedToLoadAction'));
        return;
      }

      setAction(data);
    } catch (error) {
      console.error('Error loading external action:', error);
      setError(t('externalActions.failedToLoadAction'));
      toast.error(t('externalActions.failedToLoadAction'));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/external-actions');
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">{t('externalActions.loadingAction')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !action) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('externalActions.back')}
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-red-600 mb-2">
                  {t('externalActions.errorLoadingAction')}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {error}
                </p>
                <Button onClick={handleBack}>
                  {t('externalActions.returnToActions')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ExternalActionForm
      mode="edit"
      whatsappInstanceId={action.whatsapp_instance_id}
      existingAction={action}
    />
  );
};

export default EditExternalAction;