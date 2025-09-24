import React, { useState, useEffect } from 'react';
// Card components removed - using div with consistent styling instead
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
// Badge import removed as it's not used in current implementation
import { FolderOpen, Database, AlertCircle, CheckCircle2, Loader2, Cog, Unlink } from "lucide-react";
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
  const [initialPageLoading, setInitialPageLoading] = useState(true);

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

  // Handle initial page loading
  useEffect(() => {
    // Set initial page loading to false after a short delay
    const timer = setTimeout(() => {
      setInitialPageLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

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

  // Show initial loading state
  if (initialPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          {/* Modern animated loader with gradient */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Database className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Loading Data Collection
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Please wait while we prepare your data collection settings...
            </p>
          </div>
          
          {/* Loading dots animation */}
          <div className="flex space-x-1">
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
                  Data Collection
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  Automatically collect and export customer data from WhatsApp conversations to Google Sheets
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">

        {/* WhatsApp Instance Selection */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Choose WhatsApp Number
              </h2>
            </div>
            <WhatsAppInstanceSelector 
              value={selectedInstance}
              onChange={setSelectedInstance}
            />
          </div>
        </div>

        {selectedInstance && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="setup">
                <Cog className="h-4 w-4 mr-2" />
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
              <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-1">Google Sheets Connection</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Connect your Google account to export data to Google Sheets
                    </p>
                  </div>
                  <div className="space-y-4">
                {configLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading configuration...
                  </div>
                ) : isConnected ? (
                  <>
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 px-3 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                          {disconnectMutation.isPending ? (
                            <>Disconnecting from {sheetsConfig?.google_email}...</>
                          ) : (
                            <>Connected as {sheetsConfig?.google_email}</>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    {disconnectMutation.isPending && (
                      <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                        <div className="flex items-start gap-3">
                          <Loader2 className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 animate-spin mt-0.5" />
                          <div className="text-sm text-orange-900 dark:text-orange-100">
                            <strong>Disconnecting Google Sheets...</strong><br />
                            • Stopping data collection<br />
                            • Removing integration settings<br />
                            • Cleaning up configuration<br />
                            <span className="text-sm text-orange-700 dark:text-orange-300 mt-2 block">
                              Please wait, do not refresh the page.
                            </span>
                          </div>
                        </div>
                      </div>
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
                        className="w-full border border-red-200 bg-red-50 text-red-900 hover:bg-red-500 hover:text-white"
                        disabled={disconnectMutation.isPending}
                      >
                        {disconnectMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          <>
                            <Unlink className="h-4 w-4" />
                            Disconnect Google Account
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                        <p className="text-sm text-yellow-900 dark:text-yellow-100">
                          No Google account connected. Connect your account to start collecting data.
                        </p>
                      </div>
                    </div>
                    <GoogleAuthButton onClick={handleGoogleAuth} />
                  </>
                )}
                  </div>
                </div>
              </div>

              {/* Data Collection Toggle */}
              {isConnected && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="pb-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <Database className="h-5 w-5 mr-2 text-amber-500" />
                          <h3 className="text-lg font-semibold">Data Collection Status</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          {toggleDataCollection.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                          )}
                          <Switch 
                            checked={aiConfig?.enable_data_collection || false}
                            onCheckedChange={(checked) => toggleDataCollection.mutate(checked)}
                            disabled={toggleDataCollection.isPending || disconnectMutation.isPending}
                            className="data-[state=checked]:bg-green-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="pt-0">
                      {aiConfig?.enable_data_collection ? (
                        <div className="bg-green-50 dark:bg-green-950/20 rounded-xl border border-green-200 dark:border-green-900 p-3">
                          <p className="text-sm font-medium text-green-700 dark:text-green-400">
                            Data Collection is Active
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                            This WhatsApp number will automatically collect data from conversations
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
                            Data Collection is Disabled
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">
                            This WhatsApp number will not collect any data from conversations
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Please select a WhatsApp number to configure data collection
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataCollection;