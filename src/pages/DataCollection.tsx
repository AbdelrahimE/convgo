import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FolderOpen, 
  Settings, 
  Database, 
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Download
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GoogleAuthButton from "@/components/data-collection/GoogleAuthButton";
import SheetSelector from "@/components/data-collection/SheetSelector";
import FieldsBuilder from "@/components/data-collection/FieldsBuilder";
import CollectedDataView from "@/components/data-collection/CollectedDataView";
import WhatsAppInstanceSelector from "@/components/data-collection/WhatsAppInstanceSelector";

interface GoogleSheetsConfig {
  id: string;
  whatsapp_instance_id: string;
  google_sheet_id: string;
  sheet_name: string;
  google_email: string;
  is_active: boolean;
  last_sync_at: string;
  created_at: string;
  updated_at: string;
}

const DataCollection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");

  // Fetch Google Sheets configuration
  const { data: sheetsConfig, isLoading: configLoading } = useQuery({
    queryKey: ['google-sheets-config', selectedInstance],
    queryFn: async () => {
      if (!selectedInstance) return null;
      
      const { data, error } = await supabase
        .from('google_sheets_config')
        .select('*')
        .eq('whatsapp_instance_id', selectedInstance)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching config:', error);
      }
      
      return data as GoogleSheetsConfig | null;
    },
    enabled: !!selectedInstance
  });

  // Check if Google account is connected
  useEffect(() => {
    setIsConnected(!!sheetsConfig?.google_email);
  }, [sheetsConfig]);

  // Toggle data collection for WhatsApp instance
  const toggleDataCollection = useMutation({
    mutationFn: async (enable: boolean) => {
      const { error } = await supabase
        .from('whatsapp_ai_config')
        .update({ 
          enable_data_collection: enable,
          data_collection_config_id: enable ? sheetsConfig?.id : null
        })
        .eq('whatsapp_instance_id', selectedInstance);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-config', selectedInstance] });
      toast({
        title: "Success",
        description: "Data collection settings updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    }
  });

  // Fetch WhatsApp AI config
  const { data: aiConfig } = useQuery({
    queryKey: ['whatsapp-ai-config', selectedInstance],
    queryFn: async () => {
      if (!selectedInstance) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('enable_data_collection, data_collection_config_id')
        .eq('whatsapp_instance_id', selectedInstance)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching AI config:', error);
      }
      
      return data;
    },
    enabled: !!selectedInstance
  });

  const handleGoogleAuth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-auth', {
        body: { 
          action: 'init',
          whatsapp_instance_id: selectedInstance 
        }
      });

      if (error) throw error;
      
      // Redirect to Google OAuth
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      toast({
        title: "Authentication Error",
        description: error.message || "Failed to initiate Google authentication",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase
        .from('google_sheets_config')
        .delete()
        .eq('whatsapp_instance_id', selectedInstance);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['google-sheets-config'] });
      toast({
        title: "Disconnected",
        description: "Google Sheets disconnected successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-2">Data Collection</h1>
        <p className="text-muted-foreground">
          Automatically collect and export customer data from WhatsApp conversations to Google Sheets
        </p>
      </div>

      {/* WhatsApp Instance Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Choose WhatsApp Number
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsAppInstanceSelector 
            value={selectedInstance}
            onChange={setSelectedInstance}
          />
        </CardContent>
      </Card>

      {selectedInstance && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">
              <Settings className="h-4 w-4 mr-2" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="fields" disabled={!isConnected}>
              <Database className="h-4 w-4 mr-2" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="data" disabled={!isConnected}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Collected Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            {/* Google Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle>Google Sheets Connection</CardTitle>
                <CardDescription>
                  Connect your Google account to export data to Google Sheets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {configLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading configuration...
                  </div>
                ) : isConnected ? (
                  <>
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Connected as <strong>{sheetsConfig?.google_email}</strong>
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-4">
                      <SheetSelector 
                        configId={sheetsConfig?.id || ''}
                        currentSheetId={sheetsConfig?.google_sheet_id}
                        sheetName={sheetsConfig?.sheet_name}
                      />
                      <Button 
                        onClick={handleDisconnect}
                        variant="outline"
                        className="w-full"
                      >
                        Disconnect Google Account
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No Google account connected. Connect your account to start collecting data.
                      </AlertDescription>
                    </Alert>
                    <GoogleAuthButton onClick={handleGoogleAuth} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Data Collection Toggle */}
            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle>Data Collection Status</CardTitle>
                  <CardDescription>
                    Enable or disable automatic data collection for this WhatsApp number
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {aiConfig?.enable_data_collection ? 'Active' : 'Inactive'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {aiConfig?.enable_data_collection 
                          ? 'Data is being collected from conversations'
                          : 'Data collection is disabled'}
                      </p>
                    </div>
                    <Button
                      onClick={() => toggleDataCollection.mutate(!aiConfig?.enable_data_collection)}
                      disabled={toggleDataCollection.isPending}
                    >
                      {toggleDataCollection.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {aiConfig?.enable_data_collection ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="fields" className="space-y-6">
            {sheetsConfig && (
              <FieldsBuilder configId={sheetsConfig.id} />
            )}
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            {sheetsConfig && (
              <CollectedDataView configId={sheetsConfig.id} />
            )}
          </TabsContent>
        </Tabs>
      )}

      {!selectedInstance && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please select a WhatsApp number to configure data collection
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default DataCollection;