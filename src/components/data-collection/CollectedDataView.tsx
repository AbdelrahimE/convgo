import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ExternalLink,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  Eye,
  Trash2,
  Database,
  ListCheck
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CollectedDataViewProps {
  configId: string;
}

interface DataSession {
  id: string;
  conversation_id: string;
  phone_number: string;
  collected_data: Record<string, unknown>;
  missing_fields: string[];
  is_complete: boolean;
  exported_to_sheets: boolean;
  sheet_row_number?: number;
  created_at: string;
  completed_at?: string;
  exported_at?: string;
}

interface DataField {
  id: string;
  field_name: string;
  field_display_name: string;
  field_display_name_ar?: string;
  field_type: string;
}

const CollectedDataView: React.FC<CollectedDataViewProps> = ({ configId }) => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'incomplete' | 'exported'>('all');
  const [selectedSession, setSelectedSession] = useState<DataSession | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Fetch data collection fields
  const { data: fields = [] } = useQuery({
    queryKey: ['data-collection-fields', configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_collection_fields')
        .select('id, field_name, field_display_name, field_display_name_ar, field_type')
        .eq('config_id', configId)
        .order('field_order');

      if (error) throw error;
      return data as DataField[];
    }
  });

  // Fetch collected data sessions
  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ['collected-data-sessions', configId, filterStatus, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('collected_data_sessions')
        .select('*')
        .eq('config_id', configId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filterStatus === 'complete') {
        query = query.eq('is_complete', true);
      } else if (filterStatus === 'incomplete') {
        query = query.eq('is_complete', false);
      } else if (filterStatus === 'exported') {
        query = query.eq('exported_to_sheets', true);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(`phone_number.ilike.%${searchQuery}%,conversation_id.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DataSession[];
    }
  });

  // Helper function to transform collected data using display names
  const transformCollectedData = (collectedData: Record<string, unknown>) => {
    const transformed: Record<string, unknown> = {};
    
    Object.entries(collectedData || {}).forEach(([fieldName, value]) => {
      const field = fields.find(f => f.field_name === fieldName);
      const displayName = field?.field_display_name_ar || field?.field_display_name || fieldName;
      transformed[displayName] = value;
    });
    
    return transformed;
  };

  // Helper function to transform missing fields using display names
  const transformMissingFields = (missingFields: string[]) => {
    return missingFields.map(fieldName => {
      const field = fields.find(f => f.field_name === fieldName);
      return field?.field_display_name_ar || field?.field_display_name || fieldName;
    });
  };

  // Export single session to Google Sheets
  const exportSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke('sheets-exporter', {
        body: { sessionId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collected-data-sessions'] });
      toast.success("Data exported to Google Sheets successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to export data to Google Sheets");
    }
  });

  // Export all complete sessions
  const exportAll = useMutation({
    mutationFn: async () => {
      const completeSessions = sessions.filter(s => s.is_complete && !s.exported_to_sheets);
      
      if (completeSessions.length === 0) {
        throw new Error("No complete sessions to export");
      }

      const { data, error } = await supabase.functions.invoke('sheets-exporter', {
        body: { 
          configId,
          exportAll: true 
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collected-data-sessions'] });
      toast.success(`Successfully exported ${data.exported} sessions to Google Sheets`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to export data");
    }
  });

  // Delete session
  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('collected_data_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collected-data-sessions'] });
      toast.success("Session deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete session");
    }
  });

  const getStatusBadge = (session: DataSession) => {
    if (session.exported_to_sheets) {
      return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" /> Exported</Badge>;
    }
    if (session.is_complete) {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Ready to Export</Badge>;
    }
    return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" /> Incomplete</Badge>;
  };

  const viewDetails = (session: DataSession) => {
    setSelectedSession(session);
    setIsDetailsOpen(true);
  };

  const completeSessions = sessions.filter(s => s.is_complete && !s.exported_to_sheets);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Total Sessions */}
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Sessions</p>
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-300 block mt-1">{sessions.length}</span>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">All Data Collections</p>
            </div>
            <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        {/* Complete */}
        <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-900 dark:text-green-100">Complete</p>
              <span className="text-2xl font-bold text-green-700 dark:text-green-300 block mt-1">
                {sessions.filter(s => s.is_complete).length}
              </span>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Ready for Export</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Incomplete */}
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-100">Incomplete</p>
              <span className="text-2xl font-bold text-orange-700 dark:text-orange-300 block mt-1">
                {sessions.filter(s => !s.is_complete).length}
              </span>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Missing Data Fields</p>
            </div>
            <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        {/* Exported */}
        <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-900 dark:text-purple-100">Exported</p>
              <span className="text-2xl font-bold text-purple-700 dark:text-purple-300 block mt-1">
                {sessions.filter(s => s.exported_to_sheets).length}
              </span>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Sent to Google Sheets</p>
            </div>
            <FileSpreadsheet className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* Actions and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListCheck className="h-5 w-5 flex-shrink-0" />
            Collected Data
          </CardTitle>
          <CardDescription className="text-sm">
            View and manage data collected from WhatsApp conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by phone or conversation ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
                <SelectItem value="exported">Exported</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="icon"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={() => exportAll.mutate()}
                disabled={completeSessions.length === 0 || exportAll.isPending}
              >
                {exportAll.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export All ({completeSessions.length})
              </Button>
            </div>
          </div>

          {/* Data Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <Alert>
              <AlertDescription>
                No data collected yet. Data will appear here when customers interact with your WhatsApp bot.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Conversation ID</TableHead>
                    <TableHead>Fields Collected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        {session.phone_number}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 rounded">
                          {session.conversation_id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        {Object.keys(session.collected_data || {}).length} fields
                        {session.missing_fields.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({session.missing_fields.length} missing)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(session)}</TableCell>
                      <TableCell>
                        {format(new Date(session.created_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => viewDetails(session)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {session.is_complete && !session.exported_to_sheets && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => exportSession.mutate(session.id)}
                              disabled={exportSession.isPending}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSession.mutate(session.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          
          {selectedSession && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone Number</Label>
                  <p className="text-sm font-medium">{selectedSession.phone_number}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedSession)}</div>
                </div>
                <div>
                  <Label>Created At</Label>
                  <p className="text-sm">
                    {format(new Date(selectedSession.created_at), 'PPP HH:mm')}
                  </p>
                </div>
                {selectedSession.exported_at && (
                  <div>
                    <Label>Exported At</Label>
                    <p className="text-sm">
                      {format(new Date(selectedSession.exported_at), 'PPP HH:mm')}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label>Collected Data</Label>
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <pre className="text-sm overflow-x-auto">
                    {JSON.stringify(transformCollectedData(selectedSession.collected_data), null, 2)}
                  </pre>
                </div>
              </div>

              {selectedSession.missing_fields.length > 0 && (
                <div>
                  <Label>Missing Fields</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {transformMissingFields(selectedSession.missing_fields).map((fieldDisplayName, index) => (
                      <Badge key={selectedSession.missing_fields[index]} variant="outline">
                        {fieldDisplayName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedSession.sheet_row_number && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Exported to Google Sheets - Row #{selectedSession.sheet_row_number}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CollectedDataView;