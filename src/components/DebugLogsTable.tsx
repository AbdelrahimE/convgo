
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CategoryBadge } from '@/components/ui/category-badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import logger from '@/utils/logger';

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
  
  // Debug logging has been moved to console only
  const logs: DebugLog[] = [];
  const categories: { category: string }[] = [];
  const isLoading = false;
  const isRefetching = false;
  
  const refetch = () => {
    // No-op since we're not fetching from database anymore
  };
  
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
      'WEBHOOK_REQUEST': 'bg-blue-600',
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
        <div className="text-center py-8 text-muted-foreground">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">Debug logging has been moved to console only</p>
          <p className="text-sm">
            All debug logs are now displayed in the server console for better performance. 
            The webhook_debug_logs table has been removed to improve system efficiency.
          </p>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> You can view all debug logs in your Supabase Edge Functions console or server logs.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
