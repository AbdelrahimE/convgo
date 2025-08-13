import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Plus, Check, X, RefreshCw, LogOut, Trash2, MessageSquare, ArrowRight, Bot, Send, PhoneOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import logger from '@/utils/logger';
import { logWebhook } from '@/utils/webhook-logger';
import WhatsAppAIToggle from '@/components/WhatsAppAIToggle';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  last_connected: string | null;
  qr_code?: string;
  reject_calls: boolean;
  reject_calls_message: string;
}
const statusConfig = {
  Connected: {
    color: "text-green-500 bg-green-50 dark:bg-green-950/50",
    icon: Check,
    animation: "",
    label: "Connected"
  },
  Disconnected: {
    color: "text-red-500 bg-red-50 dark:bg-red-950/50",
    icon: X,
    animation: "",
    label: "Disconnected"
  },
  Connecting: {
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50",
    icon: Loader2,
    animation: "animate-spin",
    label: "Connecting"
  },
  Created: {
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50",
    icon: Loader2,
    animation: "animate-spin",
    label: "Connecting"
  }
};
const StatusBadge = ({
  status
}: {
  status: string;
}) => {
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config.icon;
  return <div className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium", config.color, status === "Connecting" && "animate-pulse")}>
      <Icon className={cn("w-4 h-4 mr-1.5", config.animation)} />
      {config.label}
    </div>;
};
const InstanceActions = ({
  instance,
  isLoading,
  onLogout,
  onReconnect,
  onDelete,
  onToggleCallRejection,
  onCheckStatus
}: {
  instance: WhatsAppInstance;
  isLoading: boolean;
  onLogout: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onToggleCallRejection: () => void;
  onCheckStatus: () => void;
}) => {
  return <TooltipProvider>
      <div className="flex items-center justify-end space-x-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={onCheckStatus} disabled={isLoading} className="h-9 w-9">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Check connection status</p>
          </TooltipContent>
        </Tooltip>
        
        {instance.status === 'Connected' && <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" onClick={onLogout} disabled={isLoading} className="w-full sm:w-auto font-semibold">
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Disconnect this WhatsApp instance</p>
            </TooltipContent>
          </Tooltip>}
        
        {instance.status === 'Disconnected' && <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" onClick={onReconnect} disabled={isLoading} className="w-full sm:w-auto">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reconnect this WhatsApp instance</p>
            </TooltipContent>
          </Tooltip>}

        <Tooltip>
          <TooltipTrigger asChild>
            
          </TooltipTrigger>
          <TooltipContent>
            <p>Configure call rejection settings</p>
          </TooltipContent>
        </Tooltip>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isLoading} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-center font-semibold">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete WhatsApp Instance</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this WhatsApp instance? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>;
};
const EmptyState = ({
  onCreateClick
}: {
  onCreateClick: () => void;
}) => {
  return <Card className="w-full mx-auto bg-background">
      <CardContent className="p-6 md:p-8 lg:p-10">
        <div className="flex flex-col items-center text-center space-y-6 md:space-y-8">
          <div className="relative">
            <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-primary/5 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-primary/40" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Bot className="w-3 h-3 md:w-4 md:h-4 text-primary/40" />
            </div>
          </div>

          <div className="space-y-2 md:space-y-3">
            <h3 className="text-lg md:text-xl lg:text-2xl font-semibold tracking-tight">
              Start Your WhatsApp Integration
            </h3>
            <p className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto">
              Connect your WhatsApp account to start automating responses with AI
            </p>
          </div>

          <div className="w-full max-w-xl space-y-6 md:space-y-8">
            <div className="space-y-4 md:space-y-6">
              {[{
              title: "Create an Instance",
              description: "Set up your first WhatsApp connection",
              icon: Plus
            }, {
              title: "Scan QR Code",
              description: "Link your WhatsApp account securely",
              icon: MessageSquare
            }, {
              title: "Start Automating",
              description: "Let AI handle your customer inquiries",
              icon: Bot
            }].map((step, index) => <div key={index} className="flex items-start space-x-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm md:text-base font-medium">{step.title}</h4>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>)}
            </div>

            <Button onClick={onCreateClick} size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
              Create Your First Instance
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>;
};
const CallRejectionForm = ({
  instance,
  onCancel,
  onSave,
  isLoading
}: {
  instance: WhatsAppInstance;
  onCancel: () => void;
  onSave: (message: string) => Promise<void>;
  isLoading: boolean;
}) => {
  const [message, setMessage] = useState(instance.reject_calls_message || 'Sorry, I cannot take your call right now. Please leave a message and I will get back to you.');
  const MAX_CHAR_LIMIT = 95;
  const isOverLimit = message.length > MAX_CHAR_LIMIT;
  const charCount = message.length;
  const remainingChars = MAX_CHAR_LIMIT - charCount;
  const getCountColor = () => {
    if (remainingChars <= 0) return "text-red-500";
    if (remainingChars <= 10) return "text-amber-500";
    return "text-muted-foreground";
  };
  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    delay: 0.3
  }}>
      <Card className="mb-6 md:mb-8">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl md:text-2xl font-bold">Call Rejection Settings</CardTitle>
          <CardDescription>
            Configure automatic call rejection for <span className="font-medium">{instance.instance_name}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => {
          e.preventDefault();
          if (message.trim() && !isOverLimit) {
            onSave(message);
          } else if (isOverLimit) {
            toast.error(`Message exceeds the ${MAX_CHAR_LIMIT} character limit`);
          }
        }} className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="rejection-message">Rejection Message</Label>
                <span className={cn("text-xs font-medium", getCountColor())}>
                  {charCount}/{MAX_CHAR_LIMIT}
                </span>
              </div>
              <LanguageAwareTextarea id="rejection-message" value={message} onChange={e => {
              setMessage(e.target.value);
            }} placeholder="Enter message to send when rejecting calls" className={cn("w-full", isOverLimit && "border-red-500 focus-visible:ring-red-500")} autoExpand={true} minRows={3} maxRows={6} />
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  This message will be automatically sent when rejecting incoming calls.
                </p>
                {isOverLimit && <p className="text-sm text-red-500 font-medium">
                    Exceeds limit by {Math.abs(remainingChars)} characters
                  </p>}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button type="submit" disabled={isLoading || !message.trim() || isOverLimit} size="lg" className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700">
                {isLoading ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </> : <>
                    <Send className="mr-2 h-4 w-4" />
                    Enable Call Rejection
                  </>}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:flex-1" size="lg">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>;
};
const CallRejectionToggle = ({
  instance,
  onSettings,
  onToggle,
  isLoading
}: {
  instance: WhatsAppInstance;
  onSettings: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
  isLoading: boolean;
}) => {
  return <div className="space-y-4 mt-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label htmlFor={`call-rejection-toggle-${instance.id}`} className="text-base">
          Auto-Reject Calls
        </Label>
        <div className="flex items-center space-x-2">
          <Switch id={`call-rejection-toggle-${instance.id}`} checked={instance.reject_calls} onCheckedChange={checked => {
          if (checked) {
            onSettings();
          } else {
            onToggle(false);
          }
        }} disabled={isLoading || instance.status !== 'Connected'} className="data-[state=checked]:bg-green-500" />
          {instance.reject_calls && <Button variant="ghost" size="sm" onClick={onSettings} className="h-8 px-2">
              Edit
            </Button>}
        </div>
      </div>
      
      {instance.reject_calls && <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="text-sm text-muted-foreground mb-1">Current rejection message:</p>
          <p className="text-sm font-medium">{instance.reject_calls_message}</p>
        </div>}
    </div>;
};
const WhatsAppLink = () => {
  const {
    user,
    loading: authLoading
  } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instanceName, setInstanceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCallRejectionForm, setShowCallRejectionForm] = useState(false);
  const [selectedInstanceForCallSettings, setSelectedInstanceForCallSettings] = useState<WhatsAppInstance | null>(null);
  const [instanceLimit, setInstanceLimit] = useState(0);
  const [isValidName, setIsValidName] = useState(true);
  const [showProxyFields, setShowProxyFields] = useState(false);
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  useEffect(() => {
    if (!authLoading && user) {
      fetchInstances();
      fetchUserProfile();
    } else if (!authLoading) {
      setInitialLoading(false);
    }
  }, [user, authLoading]);
  useEffect(() => {
    if (!user) return;
    logWebhook('Setting up realtime subscription for WhatsApp instances', {
      userId: user.id
    });
    const channel = supabase.channel('whatsapp-instances-changes').on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'whatsapp_instances',
      filter: `user_id=eq.${user.id}`
    }, payload => {
      logger.log('Received real-time update for WhatsApp instance:', payload);
      const previousInstance = payload.old as WhatsAppInstance;
      const updatedInstance = payload.new as WhatsAppInstance;
      setInstances(prevInstances => prevInstances.map(instance => instance.id === updatedInstance.id ? {
        ...instance,
        ...updatedInstance
      } : instance));
      if (previousInstance && updatedInstance.status === 'Connected' && previousInstance.status !== 'Connected') {
        const instanceName = updatedInstance.instance_name;
        toast.success(`WhatsApp instance ${instanceName} connected successfully`);
      }
    }).subscribe(status => {
      logger.log(`Supabase channel status: ${status}`);
      if (status === 'SUBSCRIBED') {
        logger.log('Successfully subscribed to WhatsApp instances changes');
      }
    });
    return () => {
      logger.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user]);
  const fetchUserProfile = async () => {
    try {
      const {
        data: profile,
        error
      } = await supabase.from('profiles').select('instance_limit').eq('id', user?.id).single();
      if (error) throw error;
      setInstanceLimit(profile.instance_limit);
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      toast.error('Failed to fetch user profile');
    }
  };
  const fetchInstances = async () => {
    try {
      setInitialLoading(true);
      const {
        data,
        error
      } = await supabase.from('whatsapp_instances').select('*').eq('user_id', user?.id);
      if (error) throw error;
      setInstances(data || []);
    } catch (error) {
      logger.error('Error fetching WhatsApp instances:', error);
      toast.error('Failed to fetch WhatsApp instances');
    } finally {
      setInitialLoading(false);
    }
  };
  const handleCheckStatus = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      logger.log(`Checking status for instance: ${instanceName}`);
      
      const success = await checkInstanceStatus(instanceName);
      if (success) {
        toast.success(`Status updated for ${instanceName}`);
      } else {
        toast.info(`Status checked for ${instanceName}`);
      }
    } catch (error) {
      logger.error('Error checking instance status:', error);
      toast.error(`Failed to check status for ${instanceName}`);
    } finally {
      setIsLoading(false);
    }
  };

  const checkInstanceStatus = async (name: string) => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'CHECK_STATUS',
          instanceName: name.trim()
        }
      });
      if (error) throw error;
      if (data) {
        const state = data.state;
        const updatedStatus = state === 'open' || state === 'Connected' ? 'Connected' : state === 'connecting' || state === 'STARTING' ? 'Connecting' : state === 'qrcode' ? 'Connecting' : 'Disconnected';
        
        // Update database with the new status
        const updateData: any = {
          status: updatedStatus
        };
        
        if (updatedStatus === 'Connected') {
          updateData.last_connected = new Date().toISOString();
        }
        
        await supabase.from('whatsapp_instances').update(updateData).eq('instance_name', name);
        
        // Update local state
        setInstances(prev => prev.map(instance => instance.instance_name === name ? {
          ...instance,
          status: updatedStatus,
          qr_code: updatedStatus === 'Connected' ? undefined : instance.qr_code,
          last_connected: updatedStatus === 'Connected' ? new Date().toISOString() : instance.last_connected
        } : instance));
        
        return updatedStatus === 'Connected';
      }
      return false;
    } catch (error: any) {
      logger.error('Status check error:', error);
      return false;
    }
  };
  const createInstance = async (instanceName: string) => {
    try {
      if (instances.length >= instanceLimit) {
        toast.error(`You have reached your limit of ${instanceLimit} instances`);
        return;
      }
      setIsLoading(true);
      const requestBody: any = {
        operation: 'CREATE_INSTANCE',
        instanceName
      };
      
      if (showProxyFields && proxyHost && proxyPort) {
        requestBody.proxyHost = proxyHost;
        requestBody.proxyPort = proxyPort;
        requestBody.proxyProtocol = 'http';
        if (proxyUsername) {
          requestBody.proxyUsername = proxyUsername;
        }
        if (proxyPassword) {
          requestBody.proxyPassword = proxyPassword;
        }
      }
      
      const {
        data,
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: requestBody
      });
      if (error) throw error;
      logger.log('Response from create:', data);
      const qrCodeData = extractQRCode(data);
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }
      const {
        data: instanceData,
        error: dbError
      } = await supabase.from('whatsapp_instances').insert({
        user_id: user?.id,
        instance_name: instanceName,
        status: 'Created'
      }).select().single();
      if (dbError) throw dbError;
      setInstances(prev => [...prev, {
        ...instanceData,
        qr_code: qrCodeData
      }]);
      setShowCreateForm(false);
      setInstanceName('');
      setShowProxyFields(false);
      setProxyHost('');
      setProxyPort('');
      setProxyUsername('');
      setProxyPassword('');
    } catch (error: any) {
      logger.error('Error creating WhatsApp instance:', error);
      toast.error(`Failed to create WhatsApp instance: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  const handleDelete = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      const {
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'DELETE_INSTANCE',
          instanceName
        }
      });
      if (error) throw error;
      await supabase.from('whatsapp_instances').delete().eq('id', instanceId);
      setInstances(prev => prev.filter(instance => instance.id !== instanceId));
      toast.success('WhatsApp instance deleted successfully');
    } catch (error) {
      logger.error('Error deleting WhatsApp instance:', error);
      toast.error('Failed to delete WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };
  const handleLogout = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      const {
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'LOGOUT_INSTANCE',
          instanceName
        }
      });
      if (error) throw error;
      await supabase.from('whatsapp_instances').update({
        status: 'Disconnected',
        last_connected: null
      }).eq('id', instanceId);
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'Disconnected',
        last_connected: null
      } : instance));
      toast.success('WhatsApp instance logged out successfully');
    } catch (error) {
      logger.error('Error logging out WhatsApp instance:', error);
      toast.error('Failed to logout WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };
  const handleReconnect = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      const {
        error: updateError
      } = await supabase.from('whatsapp_instances').update({
        status: 'Connecting'
      }).eq('id', instanceId);
      if (updateError) throw updateError;
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'Connecting'
      } : instance));
      const {
        data,
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'CONNECT_INSTANCE',
          instanceName: instanceName.trim()
        }
      });
      if (error) throw error;
      logger.log('Response from reconnect:', data);
      const qrCodeData = extractQRCode(data);
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'Connecting',
        qr_code: qrCodeData
      } : instance));
      toast.success('Scan the QR code to reconnect your WhatsApp instance');
    } catch (error: any) {
      logger.error('Error reconnecting WhatsApp instance:', error);
      toast.error('Failed to reconnect WhatsApp instance');
      await supabase.from('whatsapp_instances').update({
        status: 'Disconnected'
      }).eq('id', instanceId);
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'Disconnected'
      } : instance));
    } finally {
      setIsLoading(false);
    }
  };
  const handleCallRejectionToggle = (instance: WhatsAppInstance) => {
    setSelectedInstanceForCallSettings(instance);
    setShowCallRejectionForm(true);
  };
  const updateCallRejectionSettings = async (instanceId: string, instanceName: string, enable: boolean, message?: string) => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'CALL_SETTINGS',
          instanceName: instanceName,
          rejectCall: enable,
          rejectCallsMessage: message || ''
        }
      });
      if (error) throw error;
      await supabase.from('whatsapp_instances').update({
        reject_calls: enable,
        reject_calls_message: message || ''
      }).eq('id', instanceId);
      setInstances(prevInstances => prevInstances.map(instance => instance.id === instanceId ? {
        ...instance,
        reject_calls: enable,
        reject_calls_message: message || instance.reject_calls_message
      } : instance));
      toast.success(`Call rejection ${enable ? 'enabled' : 'disabled'} for ${instanceName}`);
      if (showCallRejectionForm) {
        setShowCallRejectionForm(false);
        setSelectedInstanceForCallSettings(null);
      }
    } catch (error) {
      logger.error('Error updating call rejection settings:', error);
      toast.error('Failed to update call rejection settings');
    } finally {
      setIsLoading(false);
    }
  };
  const handleCallRejectionSave = async (message: string) => {
    if (!selectedInstanceForCallSettings) return;
    await updateCallRejectionSettings(selectedInstanceForCallSettings.id, selectedInstanceForCallSettings.instance_name, true, message);
  };
  const handleCallRejectionCancel = () => {
    setShowCallRejectionForm(false);
    setSelectedInstanceForCallSettings(null);
  };
  const disableCallRejection = async (instanceId: string, instanceName: string) => {
    await updateCallRejectionSettings(instanceId, instanceName, false);
  };
  const validateInstanceName = (name: string) => {
    const isValid = /^[0-9]+$/.test(name);
    setIsValidName(isValid);
    return isValid;
  };

  const cleanPhoneNumber = (value: string) => {
    return value.replace(/[^0-9]/g, '');
  };
  const extractQRCode = (data: any): string | null => {
    logger.log('Extracting QR code from response:', data);
    if (data.base64 && data.base64.startsWith('data:image/')) {
      logger.log('Found ready-to-use base64 image');
      return data.base64;
    }
    if (data.qrcode) {
      logger.log('Found QR code in qrcode object');
      const qrData = data.qrcode.base64 || data.qrcode.code || data.qrcode;
      if (qrData) {
        return qrData.startsWith('data:image/') ? qrData : `data:image/png;base64,${qrData}`;
      }
    }
    if (data.code) {
      logger.log('Found QR code in code field');
      return data.code.startsWith('data:image/') ? data.code : `data:image/png;base64,${data.code}`;
    }
    logger.log('No QR code found in response');
    return null;
  };
  const formatQrCodeDataUrl = (qrCodeData: string) => {
    if (!qrCodeData) return '';
    try {
      if (qrCodeData.startsWith('data:image/')) {
        return qrCodeData;
      }
      const cleanBase64 = qrCodeData.trim().replace(/[\n\r\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
      return `data:image/png;base64,${cleanBase64}`;
    } catch (error) {
      logger.error('Error formatting QR code:', error);
      return '';
    }
  };
  if (authLoading || initialLoading) {
    return <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p>Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>;
  }
  if (!user) {
    return <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              Please log in to access WhatsApp linking.
            </p>
          </CardContent>
        </Card>
      </div>;
  }
  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.3
  }} className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <motion.h1 initial={{
          opacity: 0,
          x: -20
        }} animate={{
          opacity: 1,
          x: 0
        }} transition={{
          delay: 0.2
        }} className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
            WhatsApp Instances
          </motion.h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* Usage + New button section */}
        <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.25
        }} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 font-medium text-left">
                {instances.length} of {instanceLimit} instances used
              </p>
            </div>
            <Button onClick={() => setShowCreateForm(true)} disabled={instances.length >= instanceLimit || showCreateForm} size="lg" className="w-auto bg-blue-600 hover:bg-blue-700 font-semibold">
              <Plus className="mr-2 h-4 w-4" />
              New Instance
            </Button>
          </div>
        </motion.div>

        {showCreateForm && <motion.div initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.3
      }}>
            <Card className="mb-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="space-y-1 p-4">
                <CardTitle className="text-xl md:text-2xl font-bold">Create New Instance</CardTitle>
                <CardDescription>
                  Enter your WhatsApp phone number
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={e => {
              e.preventDefault();
              if (validateInstanceName(instanceName)) {
                createInstance(instanceName);
              }
            }} className="space-y-4 md:space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="instanceName">WhatsApp Number</Label>
                    <Input id="instanceName" value={instanceName} onChange={e => {
                  const cleanedValue = cleanPhoneNumber(e.target.value);
                  setInstanceName(cleanedValue);
                  validateInstanceName(cleanedValue);
                }} placeholder="Enter WhatsApp number" className={!isValidName ? 'border-red-500' : ''} required />
                    <p className="text-xs text-muted-foreground">
                      Copy your phone number from WhatsApp and paste it here directly
                    </p>
                    {!isValidName && <p className="text-sm text-red-500">
                        WhatsApp number can only contain numbers
                      </p>}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowProxyFields(!showProxyFields)}
                      className="flex-1"
                    >
                      {showProxyFields ? 'Hide Proxy' : 'Add Proxy'}
                    </Button>
                  </div>
                  
                  {showProxyFields && (
                    <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Proxy Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="proxyHost">Proxy Host</Label>
                          <Input
                            id="proxyHost"
                            value={proxyHost}
                            onChange={e => setProxyHost(e.target.value)}
                            required={showProxyFields}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyPort">Proxy Port</Label>
                          <Input
                            id="proxyPort"
                            value={proxyPort}
                            onChange={e => setProxyPort(e.target.value)}
                            type="text"
                            required={showProxyFields}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyUsername">Proxy Username</Label>
                          <Input
                            id="proxyUsername"
                            value={proxyUsername}
                            onChange={e => setProxyUsername(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyPassword">Proxy Password</Label>
                          <Input
                            id="proxyPassword"
                            type="password"
                            value={proxyPassword}
                            onChange={e => setProxyPassword(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button type="submit" disabled={isLoading || !isValidName || !instanceName || (showProxyFields && (!proxyHost || !proxyPort))} size="lg" className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700">
                      {isLoading ? <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </> : 'Create Instance'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                  setShowCreateForm(false);
                  setInstanceName('');
                  setIsValidName(true);
                  setShowProxyFields(false);
                  setProxyHost('');
                  setProxyPort('');
                  setProxyUsername('');
                  setProxyPassword('');
                }} className="w-full sm:flex-1" size="lg">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>}

        {showCallRejectionForm && selectedInstanceForCallSettings && <CallRejectionForm instance={selectedInstanceForCallSettings} onCancel={handleCallRejectionCancel} onSave={handleCallRejectionSave} isLoading={isLoading} />}

        {instances.length > 0 ? <motion.div initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.4
      }}>
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {instances.map(instance => <Card key={instance.id} className="flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200">
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base md:text-lg font-bold">{instance.instance_name}</CardTitle>
                      <StatusBadge status={instance.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow p-4 pt-0">
                    {(instance.status === 'Created' || instance.status === 'Connecting') && instance.qr_code && <div className="flex flex-col items-center space-y-2 mb-4">
                        <p className="text-sm font-medium">Scan QR Code</p>
                        <div className="relative bg-white p-2 rounded-lg">
                          <img src={formatQrCodeDataUrl(instance.qr_code)} alt="WhatsApp QR Code" className="w-full h-auto max-w-[200px]" />
                        </div>
                      </div>}
                    
                    <InstanceActions instance={instance} isLoading={isLoading} onLogout={() => handleLogout(instance.id, instance.instance_name)} onReconnect={() => handleReconnect(instance.id, instance.instance_name)} onDelete={() => handleDelete(instance.id, instance.instance_name)} onToggleCallRejection={() => handleCallRejectionToggle(instance)} onCheckStatus={() => handleCheckStatus(instance.id, instance.instance_name)} />
                    
                    <WhatsAppAIToggle instanceId={instance.id} instanceName={instance.instance_name} instanceStatus={instance.status} />
                    
                    <CallRejectionToggle instance={instance} onSettings={() => handleCallRejectionToggle(instance)} onToggle={enabled => updateCallRejectionSettings(instance.id, instance.instance_name, enabled)} isLoading={isLoading} />
                  </CardContent>
                </Card>)}
            </div>
          </motion.div> : <EmptyState onCreateClick={() => setShowCreateForm(true)} />}
      </div>
    </motion.div>;
};
export default WhatsAppLink;