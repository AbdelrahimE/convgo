import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  RefreshCw,
  Calendar,
  TrendingUp,
  AlertCircle,
  Loader2,
  Eye,
  Filter,
  Reply,
  MessageSquare,
  Timer,
  Webhook
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import logger from '@/utils/logger';

interface ExternalAction {
  id: string;
  display_name: string;
  action_name: string;
  response_type?: string;
  confirmation_message?: string;
  response_timeout_seconds?: number;
}

interface ResponseLog {
  id: string;
  execution_log_id: string;
  response_received: boolean;
  response_message?: string;
  received_at?: string;
  expires_at: string;
  created_at: string;
}

interface ExecutionLog {
  id: string;
  external_action_id: string;
  whatsapp_conversation_id: string | null;
  whatsapp_message_id: string | null;
  intent_confidence: number | null;
  extracted_variables: Record<string, any> | null;
  webhook_payload: Record<string, any> | null;
  webhook_response: Record<string, any> | null;
  http_status_code: number | null;
  execution_status: 'pending' | 'success' | 'failed' | 'timeout';
  error_message: string | null;
  execution_time_ms: number | null;
  retry_count: number | null;
  executed_at: string;
}

interface ExternalActionLogsProps {
  open: boolean;
  onClose: () => void;
  action: ExternalAction | null;
}

const ExternalActionLogs: React.FC<ExternalActionLogsProps> = ({
  open,
  onClose,
  action
}) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [responseLogs, setResponseLogs] = useState<Record<string, ResponseLog>>({});
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);
  const [showLogDetails, setShowLogDetails] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('7d');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LOGS_PER_PAGE = 20;

  useEffect(() => {
    if (open && action) {
      loadLogs(true);
    }
  }, [open, action, statusFilter, dateFilter]);

  // Load response logs for wait_for_webhook actions
  const loadResponseLogs = async (logIds: string[]) => {
    if (logIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('external_action_responses')
        .select('*')
        .in('execution_log_id', logIds);

      if (error) throw error;

      const responseMap: Record<string, ResponseLog> = {};
      data?.forEach(response => {
        responseMap[response.execution_log_id] = response;
      });
      
      setResponseLogs(responseMap);
    } catch (error) {
      logger.error('Error loading response logs:', error);
    }
  };

  const loadLogs = async (reset = false) => {
    if (!action) return;

    setLoading(true);
    try {
      const currentPage = reset ? 1 : page;
      const offset = (currentPage - 1) * LOGS_PER_PAGE;

      let query = supabase
        .from('external_action_logs')
        .select('*')
        .eq('external_action_id', action.id)
        .order('executed_at', { ascending: false })
        .range(offset, offset + LOGS_PER_PAGE - 1);

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('execution_status', statusFilter);
      }

      // Apply date filter
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate = new Date(now);
        
        switch (dateFilter) {
          case '1d':
            startDate.setDate(now.getDate() - 1);
            break;
          case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
        }
        
        query = query.gte('executed_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      if (reset) {
        setLogs(data || []);
        setPage(1);
      } else {
        setLogs(prev => [...prev, ...(data || [])]);
      }

      // Load response logs for actions that might have responses
      const logIds = (data || []).map(log => log.id);
      await loadResponseLogs(logIds);

      setHasMore((data || []).length === LOGS_PER_PAGE);
      if (!reset) {
        setPage(prev => prev + 1);
      }
    } catch (error) {
      logger.error('Error loading execution logs:', error);
      toast.error('Failed to load execution logs');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle className="w-3 h-3" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Failed
          </Badge>
        );
      case 'timeout':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            Timeout
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const formatExecutionTime = (timeMs: number | null) => {
    if (!timeMs) return 'N/A';
    if (timeMs < 1000) return `${timeMs}ms`;
    return `${(timeMs / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, 'MMM d, yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  const getFilteredLogs = () => {
    if (!searchFilter.trim()) return logs;
    
    const searchTerm = searchFilter.toLowerCase();
    return logs.filter(log => 
      log.error_message?.toLowerCase().includes(searchTerm) ||
      JSON.stringify(log.extracted_variables || {}).toLowerCase().includes(searchTerm) ||
      log.whatsapp_conversation_id?.toLowerCase().includes(searchTerm)
    );
  };

  const calculateStats = () => {
    const filteredLogs = getFilteredLogs();
    const total = filteredLogs.length;
    const successful = filteredLogs.filter(log => log.execution_status === 'success').length;
    const failed = filteredLogs.filter(log => log.execution_status === 'failed').length;
    const avgTime = filteredLogs
      .filter(log => log.execution_time_ms)
      .reduce((sum, log, _, arr) => sum + (log.execution_time_ms! / arr.length), 0);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      avgTime: Math.round(avgTime) || 0
    };
  };

  const stats = calculateStats();
  const filteredLogs = getFilteredLogs();

  if (!action) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Execution Logs: {action.display_name}</DialogTitle>
            <DialogDescription>
              View execution history and performance metrics
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-2xl font-bold">{stats.total}</div>
                      <div className="text-sm text-muted-foreground">Total</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold">{stats.successRate}%</div>
                      <div className="text-sm text-muted-foreground">Success Rate</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <div>
                      <div className="text-2xl font-bold">{stats.failed}</div>
                      <div className="text-sm text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <div>
                      <div className="text-2xl font-bold">{stats.avgTime}ms</div>
                      <div className="text-sm text-muted-foreground">Avg Time</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="timeout">Timeout</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Time Period</Label>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1d">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredLogs.length} logs
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadLogs(true)}
                    disabled={loading}
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execution History</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {loading ? (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                        <p>Loading execution logs...</p>
                      </>
                    ) : (
                      <>
                        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No execution logs found</p>
                        {statusFilter !== 'all' || dateFilter !== 'all' || searchFilter ? (
                          <p className="text-sm mt-2">Try adjusting your filters</p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setSelectedLog(log);
                          setShowLogDetails(true);
                        }}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {getStatusBadge(log.execution_status)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {formatDate(log.executed_at)}
                              </span>
                            </div>
                            
                            {/* 🚀 V2: Show response type and status */}
                            <div className="flex items-center gap-2 mt-1">
                              {getResponseTypeBadge(action?.response_type)}
                              {getResponseStatusBadge(log)}
                            </div>
                            
                            {log.error_message && (
                              <p className="text-sm text-red-600 truncate mt-1">
                                {log.error_message}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
                            {log.http_status_code && (
                              <Badge variant="outline">
                                {log.http_status_code}
                              </Badge>
                            )}
                            
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatExecutionTime(log.execution_time_ms)}
                            </div>

                            {log.retry_count! > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {log.retry_count} retries
                              </Badge>
                            )}

                            <Eye className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    ))}

                    {hasMore && (
                      <div className="text-center py-4">
                        <Button
                          variant="outline"
                          onClick={() => loadLogs()}
                          disabled={loading}
                          className="gap-2"
                        >
                          {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <TrendingUp className="w-4 h-4" />
                          )}
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Details Dialog */}
      <Dialog open={showLogDetails} onOpenChange={setShowLogDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Execution Details</DialogTitle>
            <DialogDescription>
              {selectedLog && formatDate(selectedLog.executed_at)}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="flex-1 overflow-y-auto space-y-6">
              {/* Status and Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Status</div>
                      {getStatusBadge(selectedLog.execution_status)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">HTTP Status</div>
                      <div className="font-medium">
                        {selectedLog.http_status_code || 'N/A'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Execution Time</div>
                      <div className="font-medium">
                        {formatExecutionTime(selectedLog.execution_time_ms)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Retry Count</div>
                      <div className="font-medium">
                        {selectedLog.retry_count || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Error Message */}
              {selectedLog.error_message && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      Error Message
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-red-600">{selectedLog.error_message}</p>
                  </CardContent>
                </Card>
              )}

              {/* Extracted Variables */}
              {selectedLog.extracted_variables && Object.keys(selectedLog.extracted_variables).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Extracted Variables</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded-md">
                      <pre className="text-sm overflow-x-auto">
                        {JSON.stringify(selectedLog.extracted_variables, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Webhook Payload */}
              {selectedLog.webhook_payload && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Webhook Payload</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded-md">
                      <pre className="text-sm overflow-x-auto">
                        {JSON.stringify(selectedLog.webhook_payload, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 🚀 V2: Response Information */}
              {action?.response_type && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Reply className="w-4 h-4 text-blue-500" />
                      Response Configuration (V2)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Response Type</div>
                        {getResponseTypeBadge(action.response_type)}
                      </div>
                      
                      {action.response_type === 'wait_for_webhook' && responseLogs[selectedLog.id] && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Response Status</div>
                          {getResponseStatusBadge(selectedLog)}
                        </div>
                      )}
                      
                      {action.response_timeout_seconds && action.response_type === 'wait_for_webhook' && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Timeout</div>
                          <div className="font-medium">{action.response_timeout_seconds}s</div>
                        </div>
                      )}
                      
                      {action.confirmation_message && action.response_type !== 'none' && (
                        <div className="md:col-span-2">
                          <div className="text-sm text-muted-foreground mb-1">Configured Message</div>
                          <div className="bg-muted p-2 rounded text-sm">
                            {action.confirmation_message}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Show actual response for wait_for_webhook */}
                    {action.response_type === 'wait_for_webhook' && responseLogs[selectedLog.id]?.response_received && responseLogs[selectedLog.id]?.response_message && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-sm text-muted-foreground mb-2">Received Response</div>
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                              Dynamic Response from Automation Platform
                            </span>
                          </div>
                          <p className="text-sm text-blue-900 dark:text-blue-100">
                            {responseLogs[selectedLog.id].response_message}
                          </p>
                          {responseLogs[selectedLog.id].received_at && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                              Received: {formatDate(responseLogs[selectedLog.id].received_at!)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Webhook Response */}
              {selectedLog.webhook_response && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Webhook Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const response = selectedLog.webhook_response;
                      
                      // Handle plain text success responses
                      if (response.type === 'plain_text_success' && response.message) {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-600">Success Response</span>
                            </div>
                            <div className="bg-green-50 border border-green-200 p-3 rounded-md">
                              <p className="text-sm text-green-800 font-mono">
                                {response.message}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      
                      // Handle JSON parse errors with raw response
                      if (response.type === 'json_parse_error' && response.rawResponse) {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                              <span className="text-sm font-medium text-amber-600">Plain Text Response</span>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                              <p className="text-sm text-amber-800 font-mono mb-2">
                                {response.rawResponse}
                              </p>
                              <p className="text-xs text-amber-600">
                                Note: This response is not JSON format
                              </p>
                            </div>
                          </div>
                        );
                      }
                      
                      // Handle regular JSON responses
                      return (
                        <div className="bg-muted p-3 rounded-md">
                          <pre className="text-sm overflow-x-auto">
                            {JSON.stringify(response, null, 2)}
                          </pre>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowLogDetails(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExternalActionLogs;