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
import { toast } from 'sonner';
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
        .maybeSingle();

      if (error) {
        console.error('Error fetching google_sheets_config:', error);
        throw error;
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
      toast.success("Data collection settings updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update settings");
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
        .maybeSingle();

      if (error) {
        console.error('Error fetching whatsapp_ai_config:', error);
        throw error;
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
      toast.error(error.message || "Failed to initiate Google authentication");
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      console.log('🔌 DISCONNECT: Starting Google Sheets disconnect process', {
        selectedInstance,
        configId: sheetsConfig?.id,
        userEmail: sheetsConfig?.google_email
      });

      // Step 1: Disable data collection first to prevent new data collection
      console.log('🔧 DISCONNECT: Step 1 - Disabling data collection');
      const { error: disableError } = await supabase
        .from('whatsapp_ai_config')
        .update({ 
          enable_data_collection: false,
          data_collection_config_id: null
        })
        .eq('whatsapp_instance_id', selectedInstance);

      if (disableError) {
        console.error('❌ DISCONNECT: Failed to disable data collection', {
          error: disableError.message,
          code: disableError.code,
          selectedInstance
        });
        throw new Error(`Failed to disable data collection: ${disableError.message}`);
      }

      console.log('✅ DISCONNECT: Successfully disabled data collection');

      // Step 2: Delete Google Sheets configuration
      // The database migration ensures proper CASCADE behavior
      console.log('🗑️ DISCONNECT: Step 2 - Deleting Google Sheets configuration');
      const { error: deleteError } = await supabase
        .from('google_sheets_config')
        .delete()
        .eq('whatsapp_instance_id', selectedInstance);

      if (deleteError) {
        console.error('❌ DISCONNECT: Failed to delete Google Sheets config', {
          error: deleteError.message,
          code: deleteError.code,
          selectedInstance,
          configId: sheetsConfig?.id
        });
        
        // Try to re-enable if deletion failed (rollback)
        try {
          console.log('🔄 DISCONNECT: Attempting rollback - re-enabling data collection');
          await supabase
            .from('whatsapp_ai_config')
            .update({ 
              enable_data_collection: true,
              data_collection_config_id: sheetsConfig?.id
            })
            .eq('whatsapp_instance_id', selectedInstance);
          
          console.log('✅ DISCONNECT: Rollback successful');
        } catch (rollbackError) {
          console.error('💥 DISCONNECT: Rollback failed', rollbackError);
        }
        
        throw new Error(`Failed to disconnect Google Sheets: ${deleteError.message}`);
      }

      console.log('✅ DISCONNECT: Successfully deleted Google Sheets configuration');

      // Step 3: Verify cleanup (optional verification step)
      console.log('🔍 DISCONNECT: Step 3 - Verifying cleanup');
      const { data: verifyConfig } = await supabase
        .from('google_sheets_config')
        .select('id')
        .eq('whatsapp_instance_id', selectedInstance)
        .maybeSingle();

      if (verifyConfig) {
        console.warn('⚠️ DISCONNECT: Configuration still exists after deletion', {
          remainingConfigId: verifyConfig.id
        });
        throw new Error('Configuration cleanup verification failed');
      }

      console.log('🎉 DISCONNECT: Complete disconnect process finished successfully');
      
      return {
        success: true,
        message: 'Google Sheets disconnected successfully',
        disconnectedEmail: sheetsConfig?.google_email
      };
    },
    onSuccess: (result) => {
      console.log('✅ DISCONNECT: Mutation success callback', result);
      
      // Invalidate all related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['google-sheets-config'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-config'] });
      
      toast.success(`Disconnected from ${result.disconnectedEmail || 'Google account'} successfully`);
      
      // Reset connection state
      setIsConnected(false);
    },
    onError: (error: any) => {
      console.error('💥 DISCONNECT: Mutation error callback', {
        error: error.message,
        selectedInstance,
        timestamp: new Date().toISOString()
      });
      
      toast.error(error.message || "Failed to disconnect Google Sheets. Please try again.");
    }
  });

  const handleDisconnect = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to disconnect from ${sheetsConfig?.google_email}?\n\n` +
      `This will:\n` +
      `• Stop data collection for this WhatsApp number\n` +
      `• Remove the Google Sheets integration\n` +
      `• Keep existing data in your Google Sheet\n\n` +
      `You can reconnect at any time.`
    );

    if (!confirmed) {
      console.log('🚫 DISCONNECT: User cancelled disconnect operation');
      return;
    }

    console.log('🚀 DISCONNECT: User confirmed - starting disconnect mutation');
    disconnectMutation.mutate();
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
            <TabsTrigger value="fields" disabled={!isConnected || disconnectMutation.isPending}>
              <Database className="h-4 w-4 mr-2" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="data" disabled={!isConnected || disconnectMutation.isPending}>
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
                        {disconnectMutation.isPending ? (
                          <>Disconnecting from <strong>{sheetsConfig?.google_email}</strong>...</>
                        ) : (
                          <>Connected as <strong>{sheetsConfig?.google_email}</strong></>
                        )}
                      </AlertDescription>
                    </Alert>
                    
                    {disconnectMutation.isPending && (
                      <Alert>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <AlertDescription>
                          <strong>Disconnecting Google Sheets...</strong><br />
                          • Stopping data collection<br />
                          • Removing integration settings<br />
                          • Cleaning up configuration<br />
                          <span className="text-sm text-muted-foreground mt-2 block">
                            Please wait, do not refresh the page.
                          </span>
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="space-y-4">
                      <div className={disconnectMutation.isPending ? 'opacity-50 pointer-events-none' : ''}>
                        <SheetSelector 
                          configId={sheetsConfig?.id || ''}
                          currentSheetId={sheetsConfig?.google_sheet_id}
                          sheetName={sheetsConfig?.sheet_name}
                        />
                      </div>
                      <Button 
                        onClick={handleDisconnect}
                        variant="outline"
                        className="w-full"
                        disabled={disconnectMutation.isPending}
                      >
                        {disconnectMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          'Disconnect Google Account'
                        )}
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
                      disabled={toggleDataCollection.isPending || disconnectMutation.isPending}
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