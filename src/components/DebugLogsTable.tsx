
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  RefreshCw, 
  Search, 
  X, 
  AlertTriangle, 
  Info, 
  BarChart, 
  Clock, 
  AlertCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import logger from '@/utils/logger';
import { getReadableFileSize } from '@/utils/webhook-logger';

interface DebugLog {
  id: string;
  category: string;
  message: string;
  data: any;
  created_at: string;
  priority?: string;
}

export function DebugLogsTable() {
  const [category, setCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [limit, setLimit] = useState(50);
  const [activeTab, setActiveTab] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [showSystemAlerts, setShowSystemAlerts] = useState(true);
  
  // Fetch debug logs from webhook_debug_logs table
  const { 
    data: logs, 
    isLoading, 
    refetch,
    isRefetching,
    error: logsError
  } = useQuery({
    queryKey: ['debugLogs', category, limit, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from('webhook_debug_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (category) {
        query = query.eq('category', category);
      }
      
      if (priorityFilter) {
        query = query.eq('priority', priorityFilter);
      }
      
      const { data, error } = await query;
      
      if (error) {
        logger.error('Error fetching debug logs:', error);
        throw error;
      }
      
      return data as DebugLog[];
    }
  });
  
  // Fetch unique categories directly from the webhook_debug_logs table
  const { data: categories } = useQuery({
    queryKey: ['debugLogCategories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_debug_logs')
        .select('category')
        .order('category');
      
      if (error) {
        logger.error('Error fetching categories:', error);
        return [];
      }
      
      // Process the data to get unique categories
      const uniqueCategories = Array.from(
        new Set(data.map(item => item.category))
      ).map(category => ({ category }));
      
      return uniqueCategories;
    },
    placeholderData: []
  });
  
  // Fetch buffer system metrics for monitoring tab
  const { 
    data: bufferMetrics,
    refetch: refetchMetrics,
    isLoading: isLoadingMetrics
  } = useQuery({
    queryKey: ['bufferMetrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_debug_logs')
        .select('*')
        .eq('category', 'MESSAGE_BUFFER_STATS')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) {
        logger.error('Error fetching buffer metrics:', error);
        throw error;
      }
      
      return data as DebugLog[];
    },
    enabled: activeTab === 'monitoring'
  });
  
  // Check for system alerts and warnings
  const {
    data: systemAlerts
  } = useQuery({
    queryKey: ['systemAlerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_debug_logs')
        .select('*')
        .in('category', ['SYSTEM_WARNING', 'SYSTEM_ERROR', 'SYSTEM_ALERT'])
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) {
        logger.error('Error fetching system alerts:', error);
        return [];
      }
      
      return data as DebugLog[];
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });
  
  // Auto-refresh metrics when on monitoring tab
  useEffect(() => {
    let intervalId: number | null = null;
    
    if (activeTab === 'monitoring') {
      intervalId = setInterval(() => {
        refetchMetrics();
      }, 10000); // Refresh every 10 seconds
    }
    
    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [activeTab, refetchMetrics]);
  
  // Filter logs by search term
  const filteredLogs = logs?.filter(log => {
    if (!searchTerm) return true;
    
    const searchTermLower = searchTerm.toLowerCase();
    return (
      log.message.toLowerCase().includes(searchTermLower) ||
      log.category.toLowerCase().includes(searchTermLower) ||
      (log.data ? JSON.stringify(log.data).toLowerCase().includes(searchTermLower) : false)
    );
  });
  
  // Filter logs by tab
  const tabFilteredLogs = filteredLogs?.filter(log => {
    if (activeTab === 'all') return true;
    if (activeTab === 'errors') return log.category.includes('ERROR') || log.priority === 'high';
    if (activeTab === 'buffer') return log.category.startsWith('MESSAGE_BUFFER');
    if (activeTab === 'webhook') return log.category.startsWith('WEBHOOK');
    if (activeTab === 'ai') return log.category.startsWith('AI_');
    
    return true;
  });
  
  const handleRefresh = () => {
    refetch();
    if (activeTab === 'monitoring') {
      refetchMetrics();
    }
  };
  
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'WEBHOOK_REQUEST': 'bg-blue-500',
      'WEBHOOK_ERROR': 'bg-red-500',
      'AI_PROCESS_START': 'bg-purple-500',
      'AI_ENABLED': 'bg-green-500',
      'AI_DISABLED': 'bg-yellow-500',
      'AI_RESPONSE_GENERATED': 'bg-emerald-500',
      'AI_RESPONSE_ERROR': 'bg-red-500',
      'AI_SEARCH_ERROR': 'bg-amber-500',
      'AI_CONTEXT_ERROR': 'bg-orange-500',
      'AI_SEND_RESPONSE_ERROR': 'bg-rose-500',
      'AI_RESPONSE_SENT': 'bg-teal-500',
      'MESSAGE_BUFFER_CREATED': 'bg-blue-400',
      'MESSAGE_BUFFER_ADDED': 'bg-green-400',
      'MESSAGE_BUFFER_FLUSHING': 'bg-amber-400',
      'MESSAGE_BUFFER_PROCESSED': 'bg-teal-400',
      'MESSAGE_BUFFER_FLUSH_ERROR': 'bg-red-400',
      'MESSAGE_BUFFER_STATS': 'bg-blue-300',
      'MESSAGE_BUFFER_STUCK': 'bg-red-300',
      'MESSAGE_BUFFER_EMERGENCY_FLUSH': 'bg-amber-300',
      'SYSTEM_WARNING': 'bg-amber-500',
      'SYSTEM_ERROR': 'bg-red-500',
      'SYSTEM_INFO': 'bg-blue-500',
      'SYSTEM_ALERT': 'bg-orange-500',
      'PERFORMANCE_METRIC': 'bg-purple-300'
    };
    
    return colors[category] || 'bg-gray-500';
  };

  // Render monitoring metrics card
  const renderMonitoringTab = () => {
    if (isLoadingMetrics) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    
    if (!bufferMetrics || bufferMetrics.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No buffer metrics available
        </div>
      );
    }
    
    // Get latest metrics
    const latestMetrics = bufferMetrics[0]?.data || {};
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <BarChart className="h-4 w-4 mr-2" />
                Buffer Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Active Buffers:</dt>
                  <dd className="text-sm font-medium">{latestMetrics.totalBuffers || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Total Messages:</dt>
                  <dd className="text-sm font-medium">{latestMetrics.totalMessages || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Avg Messages/Buffer:</dt>
                  <dd className="text-sm font-medium">
                    {latestMetrics.averageMessagesPerBuffer?.toFixed(1) || 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Max Buffer Size:</dt>
                  <dd className="text-sm font-medium">{latestMetrics.maxBufferSize || 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Success Rate:</dt>
                  <dd className="text-sm font-medium">
                    {latestMetrics.processingSuccessRate?.toFixed(1) || 100}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Avg Processing Time:</dt>
                  <dd className="text-sm font-medium">
                    {latestMetrics.averageProcessingTimeMs ? 
                      `${latestMetrics.averageProcessingTimeMs.toFixed(1)}ms` : 
                      'N/A'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Emergency Flushes:</dt>
                  <dd className="text-sm font-medium">{latestMetrics.emergencyFlushes || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Memory Usage:</dt>
                  <dd className="text-sm font-medium">
                    {latestMetrics.memoryUsageBytes ? 
                      getReadableFileSize(latestMetrics.memoryUsageBytes) : 
                      'N/A'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          
          <Card className={latestMetrics.stuckBuffers > 0 ? "border-red-500" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-lg flex items-center ${latestMetrics.stuckBuffers > 0 ? "text-red-500" : ""}`}>
                <AlertCircle className="h-4 w-4 mr-2" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Stuck Buffers:</dt>
                  <dd className={`text-sm font-medium ${latestMetrics.stuckBuffers > 0 ? "text-red-500" : ""}`}>
                    {latestMetrics.stuckBuffers || 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Oldest Buffer Age:</dt>
                  <dd className="text-sm font-medium">
                    {latestMetrics.oldestBufferAge ? 
                      `${(latestMetrics.oldestBufferAge / 1000).toFixed(1)}s` : 
                      'N/A'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Last Updated:</dt>
                  <dd className="text-sm font-medium">
                    {bufferMetrics[0]?.created_at ? 
                      format(new Date(bufferMetrics[0].created_at), 'HH:mm:ss') : 
                      'N/A'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Buffer Metrics History</CardTitle>
            <CardDescription>Recent buffer system statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Buffers</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Proc. Time</TableHead>
                  <TableHead>Stuck</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bufferMetrics.map(metric => (
                  <TableRow key={metric.id}>
                    <TableCell>
                      {format(new Date(metric.created_at), 'HH:mm:ss')}
                    </TableCell>
                    <TableCell>{metric.data?.totalBuffers || 0}</TableCell>
                    <TableCell>{metric.data?.totalMessages || 0}</TableCell>
                    <TableCell>
                      {metric.data?.processingSuccessRate ? 
                        `${metric.data.processingSuccessRate.toFixed(1)}%` : 
                        'N/A'}
                    </TableCell>
                    <TableCell>
                      {metric.data?.averageProcessingTimeMs ? 
                        `${metric.data.averageProcessingTimeMs.toFixed(1)}ms` : 
                        'N/A'}
                    </TableCell>
                    <TableCell className={metric.data?.stuckBuffers > 0 ? "text-red-500 font-bold" : ""}>
                      {metric.data?.stuckBuffers || 0}
                    </TableCell>
                    <TableCell>
                      {metric.data?.memoryUsageBytes ? 
                        getReadableFileSize(metric.data.memoryUsageBytes) : 
                        'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          Webhook Debug Logs
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-2"
            onClick={() => setShowSystemAlerts(!showSystemAlerts)}
          >
            <AlertTriangle className={`h-4 w-4 ${showSystemAlerts ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          Detailed logs for diagnosing webhook and AI message processing
        </CardDescription>
        
        {showSystemAlerts && systemAlerts && systemAlerts.length > 0 && (
          <Alert className="mt-4 border-amber-500">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle>System Alerts</AlertTitle>
            <AlertDescription>
              {systemAlerts[0].message}
              {systemAlerts.length > 1 && (
                <span className="text-xs text-muted-foreground ml-2">
                  +{systemAlerts.length - 1} more alerts
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <div className="flex-1 flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Select
              value={category}
              onValueChange={setCategory}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.category} value={cat.category}>
                    {cat.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select
              value={limit.toString()}
              onValueChange={(val) => setLimit(parseInt(val))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">Last 20</SelectItem>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
                <SelectItem value="200">Last 200</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isLoading || isRefetching}
            >
              {isLoading || isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-6 lg:w-[600px]">
            <TabsTrigger value="all">All Logs</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="buffer">Buffer</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
            <TabsTrigger value="ai">AI Logs</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      
      <CardContent>
        {activeTab === 'monitoring' ? (
          renderMonitoringTab()
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : logsError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error loading logs</AlertTitle>
            <AlertDescription>
              {logsError instanceof Error ? logsError.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        ) : tabFilteredLogs && tabFilteredLogs.length > 0 ? (
          <ScrollArea className="h-[600px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[300px]">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabFilteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss.SSS')}
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(log.category)}>
                        {log.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.message}</TableCell>
                    <TableCell>
                      {log.data ? (
                        <div className="max-h-40 overflow-auto text-xs">
                          <pre className="whitespace-pre-wrap break-words">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">No data</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No debug logs found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
