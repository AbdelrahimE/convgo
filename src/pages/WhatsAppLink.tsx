
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
import { Loader2, Plus, Check, X, RefreshCw, LogOut, Trash2, MessageSquare, ArrowRight, Bot, Send, PhoneOff } from "lucide-react";
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
  CONNECTED: {
    color: "text-green-500 bg-green-50 dark:bg-green-950/50",
    icon: Check,
    animation: "",
    label: "Connected"
  },
  DISCONNECTED: {
    color: "text-red-500 bg-red-50 dark:bg-red-950/50",
    icon: X,
    animation: "",
    label: "Disconnected"
  },
  CONNECTING: {
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50",
    icon: Loader2,
    animation: "animate-spin",
    label: "Connecting"
  },
  CREATED: {
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
  return <div className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium", config.color, status === "CONNECTING" && "animate-pulse")}>
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
  onToggleCallRejection
}: {
  instance: WhatsAppInstance;
  isLoading: boolean;
  onLogout: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onToggleCallRejection: () => void;
}) => {
  return <TooltipProvider>
      <div className="flex items-center justify-end space-x-2">
        {instance.status === 'CONNECTED' && <Tooltip>
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
        
        {instance.status === 'DISCONNECTED' && <Tooltip>
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
            <Button variant="secondary" onClick={onToggleCallRejection} disabled={isLoading} className="w-full sm:w-auto">
              <PhoneOff className="mr-2 h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Configure call rejection settings</p>
          </TooltipContent>
        </Tooltip>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isLoading} className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600 text-center font-semibold">
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

            <Button onClick={onCreateClick} size="lg" className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600">
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
  return (
    <motion.div 
      initial={{
        opacity: 0,
        y: 20
      }} 
      animate={{
        opacity: 1,
        y: 0
      }} 
      transition={{
        delay: 0.3
      }}
    >
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
            if (message.trim()) {
              onSave(message);
            }
          }} className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <Label htmlFor="rejection-message">Rejection Message</Label>
              <LanguageAwareTextarea 
                id="rejection-message" 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
                placeholder="Enter message to send when rejecting calls" 
                className="w-full"
                autoExpand={true}
                minRows={3}
                maxRows={6}
              />
              <p className="text-sm text-muted-foreground">
                This message will be automatically sent when rejecting incoming calls.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button type="submit" disabled={isLoading || !message.trim()} size="lg" className="w-full sm:flex-1 bg-blue-700 hover:bg-blue-600">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enable Call Rejection
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:flex-1" size="lg">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
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
        }} disabled={isLoading || instance.status !== 'CONNECTED'} className="data-[state=checked]:bg-green-500" />
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
      const updatedInstance = payload.new as WhatsAppInstance;
      setInstances(prevInstances => prevInstances.map(instance => instance.id === updatedInstance.id ? {
        ...instance,
        ...updatedInstance
      } : instance));
      if (updatedInstance.status === 'CONNECTED') {
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
        const statusReason = data.statusReason;
        const updatedStatus = state === 'open' || state === 'CONNECTED' ? 'CONNECTED' : state === 'connecting' || state === 'STARTING' ? 'CONNECTING' : state === 'qrcode' ? 'CONNECTING' : 'DISCONNECTED';
        if (updatedStatus === 'CONNECTED') {
          await supabase.from('whatsapp_instances').update({
            status: updatedStatus,
            last_connected: new Date().toISOString()
          }).eq('instance_name', name);
        }
        setInstances(prev => prev.map(instance => instance.instance_name === name ? {
          ...instance,
          status: updatedStatus,
          qr_code: updatedStatus === 'CONNECTED' ? undefined : instance.qr_code,
          last_connected: updatedStatus === 'CONNECTED' ? new Date().toISOString() : instance.last_connected
        } : instance));
        return updatedStatus === 'CONNECTED';
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
      const {
        data,
        error
      } = await supabase.functions.invoke('evolution-api', {
        body: {
          operation: 'CREATE_INSTANCE',
          instanceName
        }
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
        status: 'CREATED'
      }).select().single();
      if (dbError) throw dbError;
      setInstances(prev => [...prev, {
        ...instanceData,
        qr_code: qrCodeData
      }]);
      setShowCreateForm(false);
      setInstanceName('');
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
        status: 'DISCONNECTED',
        last_connected: null
      }).eq('id', instanceId);
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'DISCONNECTED',
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
        status: 'CONNECTING'
      }).eq('id', instanceId);
      if (updateError) throw updateError;
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'CONNECTING'
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
        status: 'CONNECTING',
        qr_code: qrCodeData
      } : instance));
      toast.success('Scan the QR code to reconnect your WhatsApp instance');
    } catch (error: any) {
      logger.error('Error reconnecting WhatsApp instance:', error);
      toast.error('Failed to reconnect WhatsApp instance');
      await supabase.from('whatsapp_instances').update({
        status: 'DISCONNECTED'
      }).eq('id', instanceId);
      setInstances(prev => prev.map(instance => instance.id === instanceId ? {
        ...instance,
        status: 'DISCONNECTED'
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
    const isValid = /^[a-zA-Z0-9]+$/.test(name);
    setIsValidName(isValid);
    return isValid;
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
  return (
    <motion.div 
      initial={{
        opacity: 0,
        y: 20
      }} 
      animate={{
        opacity: 1,
        y: 0
      }} 
      transition={{
        duration: 0.3
      }} 
      className="container mx-auto px-4 py-8 max-w-7xl"
    >
      <div className="space-y-8">
        <motion.h1 
          initial={{
            opacity: 0,
            x: -20
          }} 
          animate={{
            opacity: 1,
            x: 0
          }} 
          transition={{
            delay: 0.2
          }} 
          className="text-2xl text-left md:text-3xl font-extrabold lg:text-4xl"
        >
          WhatsApp Instances
        </motion.h1>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-muted-foreground md:text-base font-medium text-left">
              {instances.length} of {instanceLimit} instances used
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateForm(true)} 
            disabled={instances.length >= instanceLimit || showCreateForm} 
            size="lg" 
            className="w-auto bg-blue-700 hover:bg-blue-600 font-semibold"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Instance
          </Button>
        </div>

        {showCreateForm && (
          <motion.div 
            initial={{
              opacity: 0,
              y: 20
            }} 
            animate={{
              opacity: 1,
              y: 0
            }} 
            transition={{
              delay: 0.3
            }}
          >
            <Card className="mb-6 md:mb-8">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl md:text-2xl font-bold">Create New Instance</CardTitle>
                <CardDescription>
                  Enter a unique name using only letters and numbers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form 
                  onSubmit={e => {
                    e.preventDefault();
                    if (validateInstanceName(instanceName)) {
                      createInstance(instanceName);
                    }
                  }} 
                  className="space-y-4 md:space-y-6"
                >
                  <div className="space-y-2">
                    <Label htmlFor="instanceName">Instance Name</Label>
                    <Input 
                      id="instanceName" 
                      value={instanceName} 
                      onChange={e => {
                        setInstanceName(e.target.value);
                        validateInstanceName(e.target.value);
                      }} 
                      placeholder="Enter instance name" 
                      className={!isValidName ? 'border-red-500' : ''} 
                      required 
                    />
                    {!isValidName && (
                      <p className="text-sm text-red-500">
                        Instance name can only contain letters and numbers
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      type="submit" 
                      disabled={isLoading || !isValidName || !instanceName} 
                      size="lg" 
                      className="w-full sm:flex-1 bg-blue-700 hover:bg-blue-600"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : 'Create Instance'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setShowCreateForm(false);
                        setInstanceName('');
                        setIsValidName(true);
                      }} 
                      className="w-full sm:flex-1" 
                      size="lg"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {showCallRejectionForm && selectedInstanceForCallSettings && (
          <CallRejectionForm 
            instance={selectedInstanceForCallSettings} 
            onCancel={handleCallRejectionCancel} 
            onSave={handleCallRejectionSave} 
            isLoading={isLoading} 
          />
        )}

        {instances.length > 0 ? (
          <motion.div 
            initial={{
              opacity: 0,
              y: 20
            }} 
            animate={{
              opacity: 1,
              y: 0
            }} 
            transition={{
              delay: 0.4
            }}
          >
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {instances.map(instance => (
                <Card 
                  key={instance.id} 
                  className="flex flex-col transition-all duration-200 hover:shadow-lg"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base md:text-lg font-bold">{instance.instance_name}</CardTitle>
                      <StatusBadge status={instance.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    {(instance.status === 'CREATED' || instance.status === 'CONNECTING') && instance.qr_code && (
                      <div className="flex flex-col items-center space-y-2 mb-4">
                        <p className="text-sm font-medium">Scan QR Code</p>
                        <div className="relative bg-white p-2 rounded-lg">
                          <img 
                            src={formatQrCodeDataUrl(instance.qr_code)} 
                            alt="WhatsApp QR Code" 
                            className="w-full h-auto max-w-[200px]" 
                          />
                        </div>
                      </div>
                    )}
                    
                    <InstanceActions 
                      instance={instance} 
                      isLoading={isLoading} 
                      onLogout={() => handleLogout(instance.id, instance.instance_name)} 
                      onReconnect={() => handleReconnect(instance.id, instance.instance_name)} 
                      onDelete={() => handleDelete(instance.id, instance.instance_name)} 
                      onToggleCallRejection={() => handleCallRejectionToggle(instance)} 
                    />
                    
                    <WhatsAppAIToggle 
                      instanceId={instance.id} 
                      instanceName={instance.instance_name} 
                      instanceStatus={instance.status} 
                    />
                    
                    <CallRejectionToggle 
                      instance={instance} 
                      onSettings={() => handleCallRejectionToggle(instance)} 
                      onToggle={(enabled) => updateCallRejectionSettings(instance.id, instance.instance_name, enabled)} 
                      isLoading={isLoading} 
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ) : (
          <EmptyState onCreateClick={() => setShowCreateForm(true)} />
        )}
      </div>
    </motion.div>
  );
};

export default WhatsAppLink;
