
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { format } from 'date-fns';

interface DebugLog {
  id: string;
  category: string;
  message: string;
  data: any;
  created_at: string;
}

export function DebugLogsTable() {
  const [category, setCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [limit, setLimit] = useState(50);
  
  // Fetch debug logs from webhook_debug_logs table
  const { 
    data: logs, 
    isLoading, 
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['debugLogs', category, limit],
    queryFn: async () => {
      let query = supabase
        .from('webhook_debug_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (category) {
        query = query.eq('category', category);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching debug logs:', error);
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
        .order('category')
        .distinctOn('category');
      
      if (error) {
        console.error('Error fetching categories:', error);
        return [];
      }
      
      return data as {category: string}[];
    },
    placeholderData: []
  });
  
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
  
  const handleRefresh = () => {
    refetch();
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
      'AI_RESPONSE_SENT': 'bg-teal-500'
    };
    
    return colors[category] || 'bg-gray-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Debug Logs</CardTitle>
        <CardDescription>
          Detailed logs for diagnosing webhook and AI message processing
        </CardDescription>
        
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
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredLogs && filteredLogs.length > 0 ? (
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
                {filteredLogs.map((log) => (
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
