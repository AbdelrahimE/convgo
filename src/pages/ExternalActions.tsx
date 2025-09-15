import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Play, 
  Pause,
  Activity, 
  ExternalLink,
  Zap,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import logger from '@/utils/logger';
import ExternalActionTester from '@/components/external-actions/ExternalActionTester';
import ExternalActionLogs from '@/components/external-actions/ExternalActionLogs';

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

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
  // Statistics from logs
  execution_count?: number;
  success_count?: number;
  failure_count?: number;
  last_executed_at?: string;
  average_response_time_ms?: number;
}

const ExternalActions: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [externalActions, setExternalActions] = useState<ExternalAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ExternalAction | null>(null);
  
  // Dialog states
  const [showTester, setShowTester] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Load WhatsApp instances
  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
    }
  }, [user]);

  // Load external actions when instance is selected
  useEffect(() => {
    if (selectedInstanceId) {
      loadExternalActions();
    }
  }, [selectedInstanceId]);

  const loadWhatsAppInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id)
        .order('instance_name');

      if (error) throw error;
      
      setInstances(data || []);
      if (data && data.length > 0 && !selectedInstanceId) {
        setSelectedInstanceId(data[0].id);
      }
    } catch (error) {
      logger.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    }
  };

  const loadExternalActions = async () => {
    if (!selectedInstanceId) return;
    
    setLoading(true);
    try {
      // Load actions with execution statistics
      const { data: actionsData, error: actionsError } = await supabase
        .from('external_actions')
        .select(`
          *,
          external_action_logs(
            execution_status,
            execution_time_ms,
            executed_at
          )
        `)
        .eq('whatsapp_instance_id', selectedInstanceId)
        .order('created_at', { ascending: false });

      if (actionsError) throw actionsError;

      // Calculate statistics for each action
      const actionsWithStats = (actionsData || []).map(action => {
        const logs = action.external_action_logs || [];
        const successCount = logs.filter(log => log.execution_status === 'success').length;
        const failureCount = logs.filter(log => log.execution_status === 'failed').length;
        const executionCount = logs.length;
        
        const executionTimes = logs
          .filter(log => log.execution_time_ms)
          .map(log => log.execution_time_ms);
        const avgResponseTime = executionTimes.length > 0 
          ? Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length)
          : 0;
        
        const lastExecuted = logs.length > 0 
          ? logs.sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())[0]?.executed_at
          : null;

        return {
          ...action,
          execution_count: executionCount,
          success_count: successCount,
          failure_count: failureCount,
          last_executed_at: lastExecuted,
          average_response_time_ms: avgResponseTime
        };
      });

      setExternalActions(actionsWithStats);
    } catch (error) {
      logger.error('Error loading external actions:', error);
      toast.error('Failed to load external actions');
    } finally {
      setLoading(false);
    }
  };

  const toggleActionStatus = async (actionId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('external_actions')
        .update({ is_active: isActive })
        .eq('id', actionId);

      if (error) throw error;

      setExternalActions(prev => 
        prev.map(action => 
          action.id === actionId 
            ? { ...action, is_active: isActive }
            : action
        )
      );

      toast.success(`Action ${isActive ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      logger.error('Error toggling action status:', error);
      toast.error('Failed to update action status');
    }
  };

  const deleteAction = async () => {
    if (!selectedAction) return;

    try {
      const { error } = await supabase
        .from('external_actions')
        .delete()
        .eq('id', selectedAction.id);

      if (error) throw error;

      setExternalActions(prev => prev.filter(action => action.id !== selectedAction.id));
      setShowDeleteDialog(false);
      setSelectedAction(null);
      toast.success('Action deleted successfully');
    } catch (error) {
      logger.error('Error deleting action:', error);
      toast.error('Failed to delete action');
    }
  };

  const getStatusBadge = (action: ExternalAction) => {
    if (!action.is_active) {
      return <Badge variant="secondary" className="gap-1"><Pause className="w-3 h-3" />Disabled</Badge>;
    }
    
    if (action.execution_count === 0) {
      return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Never Used</Badge>;
    }
    
    const successRate = action.success_count! / action.execution_count! * 100;
    if (successRate >= 90) {
      return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="w-3 h-3" />Healthy</Badge>;
    } else if (successRate >= 70) {
      return <Badge variant="default" className="gap-1 bg-yellow-500"><AlertTriangle className="w-3 h-3" />Warning</Badge>;
    } else {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Issues</Badge>;
    }
  };

  const formatLastExecuted = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  if (instances.length === 0) {
    return (
      <div className="w-full min-h-screen bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="py-12 text-center">
                <div className="text-muted-foreground mb-4">
                  <Zap className="w-12 h-12 mx-auto mb-2" />
                  No WhatsApp instances found
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  You need to connect a WhatsApp instance before creating external actions.
                </p>
                <Button asChild>
                  <a href="/whatsapp">Connect WhatsApp</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  External Actions
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  Create custom actions that trigger webhooks based on customer messages
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* Instance Selection and Create Action */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Select
                  value={selectedInstanceId || ''}
                  onValueChange={(value) => setSelectedInstanceId(value)}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Select WhatsApp number" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map(instance => (
                      <SelectItem key={instance.id} value={instance.id}>
                        <div className="flex items-center justify-between w-full gap-x-2">
                          <span>{instance.instance_name}</span>
                          <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                            Connected
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={() => {
                  if (selectedInstanceId) {
                    navigate(`/external-actions/create?instance=${selectedInstanceId}`);
                  } else {
                    toast.error('Please select a WhatsApp instance first');
                  }
                }}
                className="gap-2"
                disabled={!selectedInstanceId}
              >
                <Plus className="w-4 h-4" />
                Create Action
              </Button>
            </div>
          </div>
        </div>

        {/* Actions Grid */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading external actions...</p>
              </div>
            </div>
          </div>
        ) : externalActions.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="py-12 text-center">
                <div className="text-muted-foreground mb-4">
                  <Zap className="w-12 h-12 mx-auto mb-2" />
                  No external actions yet
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first external action to start automating workflows with webhooks.
                </p>
                <Button 
                  onClick={() => {
                    if (selectedInstanceId) {
                      navigate(`/external-actions/create?instance=${selectedInstanceId}`);
                    } else {
                      toast.error('Please select a WhatsApp instance first');
                    }
                  }}
                  className="gap-2"
                  disabled={!selectedInstanceId}
                >
                  <Plus className="w-4 h-4" />
                  Create First Action
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {externalActions.map((action) => (
              <div key={action.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{action.display_name}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {action.training_examples.length} training examples
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getStatusBadge(action)}
                      <Switch
                        checked={action.is_active}
                        onCheckedChange={(checked) => toggleActionStatus(action.id, checked)}
                        size="sm"
                      />
                    </div>
                  </div>
                  
                  {/* Statistics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Executions</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-sm sm:text-base">{action.execution_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Success Rate</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        {action.execution_count ? 
                          Math.round((action.success_count! / action.execution_count!) * 100) : 0
                        }%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Avg Response</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        {action.average_response_time_ms || 0}ms
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Last Used</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        {formatLastExecuted(action.last_executed_at || null)}
                      </div>
                    </div>
                  </div>

                  {/* Webhook URL */}
                  <div className="mb-4">
                    <div className="text-slate-500 dark:text-slate-400 text-sm mb-1">Webhook</div>
                    <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg truncate flex items-center gap-2">
                      <span className="truncate flex-1">{action.webhook_url}</span>
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate(`/external-actions/edit/${action.id}`);
                      }}
                      className="flex-1 gap-1 text-xs sm:text-sm"
                    >
                      <Edit className="w-3 h-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAction(action);
                        setShowTester(true);
                      }}
                      className="flex-1 gap-1 text-xs sm:text-sm"
                    >
                      <Play className="w-3 h-3" />
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAction(action);
                        setShowLogs(true);
                      }}
                      className="flex-1 gap-1 text-xs sm:text-sm"
                    >
                      <Activity className="w-3 h-3" />
                      Logs
                    </Button>
                  </div>
                  
                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedAction(action);
                      setShowDeleteDialog(true);
                    }}
                    className="w-full gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs sm:text-sm"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Action
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Tester Dialog */}
      <ExternalActionTester
        open={showTester}
        onClose={() => {
          setShowTester(false);
          setSelectedAction(null);
        }}
        action={selectedAction}
      />

      {/* Action Logs Dialog */}
      <ExternalActionLogs
        open={showLogs}
        onClose={() => {
          setShowLogs(false);
          setSelectedAction(null);
        }}
        action={selectedAction}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete External Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedAction?.display_name}"? This action cannot be undone.
              All execution logs will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteAction}>
              Delete Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExternalActions;