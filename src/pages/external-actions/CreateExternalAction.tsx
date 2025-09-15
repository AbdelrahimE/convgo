import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ExternalActionForm from '@/components/external-actions/ExternalActionForm';

const CreateExternalAction: React.FC = () => {
  const [searchParams] = useSearchParams();
  const instanceId = searchParams.get('instance');

  if (!instanceId) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-red-600 mb-2">
                  Missing WhatsApp Instance
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  No WhatsApp instance specified. Please return to External Actions and try again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ExternalActionForm 
      mode="create" 
      whatsappInstanceId={instanceId}
    />
  );
};

export default CreateExternalAction;