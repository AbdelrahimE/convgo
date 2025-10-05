import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, X, LogOut, Trash2, MessageSquare, ArrowRight, Bot, Signal, Wifi, QrCode, CirclePlus, Cog, PhoneMissed } from "lucide-react";
import { cn } from "@/lib/utils";
import logger from '@/utils/logger';
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
const StatusConfig = ({ status, t }: { status: string; t: (key: string) => string }) => {
  const configs = {
    Connected: {
      color: "text-white bg-green-500 dark:bg-green-950/50",
      icon: null,
      animation: "",
      label: t('whatsappInstances.connected')
    },
    Disconnected: {
      color: "text-white bg-red-500 dark:bg-red-950/50",
      icon: null,
      animation: "",
      label: t('whatsappInstances.disconnected')
    },
    Connecting: {
      color: "text-white bg-yellow-500 dark:bg-yellow-950/50",
      icon: Loader2,
      animation: "animate-spin",
      label: t('whatsappInstances.connecting')
    },
    Created: {
      color: "text-white bg-yellow-500 dark:bg-yellow-950/50",
      icon: Loader2,
      animation: "animate-spin",
      label: t('whatsappInstances.connecting')
    }
  };
  return configs[status as keyof typeof configs] || configs.Disconnected;
};
const StatusBadge = React.memo(({
  status,
  t
}: {
  status: string;
  t: (key: string) => string;
}) => {
  const config = StatusConfig({ status, t });
  const Icon = config.icon;
  return <div className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium", config.color, status === "Connecting" && "animate-pulse")}>
      {Icon && <Icon className={cn("w-4 h-4 mr-1.5", config.animation)} />}
      {config.label}
    </div>;
});
const InstanceActions = React.memo(({
  instance,
  isLoading,
  onLogout,
  onReconnect,
  onDelete,
  onToggleCallRejection,
  onCheckStatus,
  formatQrCodeDataUrl,
  isQrOpen,
  onQrOpenChange,
  t
}: {
  instance: WhatsAppInstance;
  isLoading: boolean;
  onLogout: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onToggleCallRejection: () => void;
  onCheckStatus: () => void;
  formatQrCodeDataUrl: (qrCodeData: string) => string;
  isQrOpen: boolean;
  onQrOpenChange: (open: boolean) => void;
  t: (key: string) => string;
}) => {
  return <TooltipProvider>
      <div className="flex items-center justify-end space-x-1 md:space-x-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCheckStatus} disabled={isLoading} className="h-8 w-8 p-0 md:h-8 md:w-8">
              <Signal className="h-3 w-3 md:h-3 md:w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('whatsappInstances.checkStatus')}</p>
          </TooltipContent>
        </Tooltip>

        {( (instance.status === 'Created' || instance.status === 'Connecting') && instance.qr_code) && (
          <QRCodeDialog
            instance={instance}
            formatQrCodeDataUrl={formatQrCodeDataUrl}
            isOpen={isQrOpen}
            onOpenChange={onQrOpenChange}
            t={t}
          />
        )}

        {instance.status === 'Connected' && <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onLogout} disabled={isLoading} className="h-8 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50">
                <LogOut className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('whatsappInstances.disconnect')}</p>
            </TooltipContent>
          </Tooltip>}

        {instance.status === 'Disconnected' && <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onReconnect} disabled={isLoading} className="h-8 px-2 bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-600 border-green-200">
                <Wifi className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('whatsappInstances.reconnect')}</p>
            </TooltipContent>
          </Tooltip>}

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isLoading} className="h-8 px-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-600 border-red-200">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('whatsappInstances.deleteInstance')}</p>
            </TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('whatsappInstances.deleteWhatsappInstance')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('whatsappInstances.deleteConfirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('whatsappInstances.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>{t('whatsappInstances.delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>;
});
const EmptyState = ({
  onCreateClick,
  t
}: {
  onCreateClick: () => void;
  t: (key: string) => string;
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
              {t('whatsappInstances.startWhatsappIntegration')}
            </h3>
            <p className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto">
              {t('whatsappInstances.connectWhatsappDescription')}
            </p>
          </div>

          <div className="w-full max-w-xl space-y-6 md:space-y-8">
            <div className="space-y-4 md:space-y-6">
              {[{
              title: t('whatsappInstances.createInstanceStep'),
              description: t('whatsappInstances.createInstanceDescription'),
              icon: CirclePlus
            }, {
              title: t('whatsappInstances.scanQRStep'),
              description: t('whatsappInstances.scanQRDescription'),
              icon: MessageSquare
            }, {
              title: t('whatsappInstances.startAutomating'),
              description: t('whatsappInstances.startAutomatingDescription'),
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

            <Button onClick={onCreateClick} size="lg" className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 rounded-lg">
              <CirclePlus className="mr-2 h-4 w-4" />
              {t('whatsappInstances.createFirstInstance')}
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
  isLoading,
  t
}: {
  instance: WhatsAppInstance;
  onCancel: () => void;
  onSave: (message: string) => Promise<void>;
  isLoading: boolean;
  t: (key: string) => string;
}) => {
  const [message, setMessage] = useState(instance.reject_calls_message || t('whatsappInstances.defaultRejectionMessage'));
  const MAX_CHAR_LIMIT = 95;
  const isOverLimit = message.length > MAX_CHAR_LIMIT;
  const charCount = message.length;
  const remainingChars = MAX_CHAR_LIMIT - charCount;
  const getCountColor = () => {
    if (remainingChars <= 0) return "text-red-500";
    if (remainingChars <= 10) return "text-amber-500";
    return "text-muted-foreground";
  };
  return <div>
      <Card className="mb-6 md:mb-8">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl md:text-2xl font-semibold">{t('whatsappInstances.callRejectionSettings')}</CardTitle>
          <CardDescription>
            {t('whatsappInstances.configureCallRejection')} <span className="font-medium">{instance.instance_name}</span>
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
                <Label htmlFor="rejection-message">{t('whatsappInstances.rejectionMessage')}</Label>
                <span className={cn("text-xs font-medium", getCountColor())}>
                  {charCount}/{MAX_CHAR_LIMIT}
                </span>
              </div>
              <LanguageAwareTextarea id="rejection-message" value={message} onChange={e => {
              setMessage(e.target.value);
            }} placeholder={t('whatsappInstances.defaultRejectionMessage')} className={cn("w-full", isOverLimit && "border-red-500 focus-visible:ring-red-500")} autoExpand={true} minRows={3} maxRows={6} />
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {t('whatsappInstances.rejectionMessageInstruction')}
                </p>
                {isOverLimit && <p className="text-sm text-red-500 font-medium">
                    {t('whatsappInstances.exceedsLimit')} {Math.abs(remainingChars)} {t('whatsappInstances.characters')}
                  </p>}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:justify-between">
              <Button type="button" variant="outline" onClick={onCancel}
              className="w-full sm:w-auto bg-gray-200 hover:bg-gray-300 text-gray-900 border-0 rounded-lg order-2 sm:order-1" size="lg">
                <X className="h-4 w-4" />
                {t('whatsappInstances.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading || !message.trim() || isOverLimit} size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-lg order-1 sm:order-2">
                {isLoading ? <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('whatsappInstances.saving')}
                  </> : <>
                    <PhoneMissed className="h-4 w-4" />
                    {t('whatsappInstances.enableCallRejection')}
                  </>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>;
};
const QRCodeDialog = ({
  instance,
  formatQrCodeDataUrl,
  isOpen,
  onOpenChange,
  t
}: {
  instance: WhatsAppInstance;
  formatQrCodeDataUrl: (qrCodeData: string) => string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: string) => string;
}) => {

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={!(instance.status === 'Created' || instance.status === 'Connecting') || !instance.qr_code}
            >
              <QrCode className="h-3 w-3" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('whatsappInstances.showQRCode')}</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('whatsappInstances.scanQRCode')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 p-6">
          {instance.qr_code ? (
            <>
              <div className="relative bg-white p-4 rounded-lg border">
                <img
                  src={formatQrCodeDataUrl(instance.qr_code)}
                  alt="WhatsApp QR Code"
                  className="w-64 h-64 object-contain"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t('whatsappInstances.scanQRCodeInstruction')}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('whatsappInstances.noQRCodeAvailable')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CallRejectionToggle = React.memo(({
  instance,
  onSettings,
  onToggle,
  isLoading,
  t
}: {
  instance: WhatsAppInstance;
  onSettings: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
  isLoading: boolean;
  t: (key: string) => string;
}) => {
  return <div className="flex items-center justify-center space-x-2">
      <Switch id={`call-rejection-toggle-${instance.id}`} checked={instance.reject_calls} onCheckedChange={checked => {
        if (checked) {
          onSettings();
        } else {
          onToggle(false);
        }
      }} disabled={isLoading || instance.status !== 'Connected'} className="data-[state=checked]:bg-green-500" />
      {instance.reject_calls && <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onSettings} className="h-6 w-6 p-0 rounded-full">
              <Cog className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('whatsappInstances.editRejectionMessage')}</p>
          </TooltipContent>
        </Tooltip>}
    </div>;
});
const WhatsAppLink = () => {
  const {
    user,
    loading: authLoading
  } = useAuth();
  const { t } = useTranslation();
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
  const [openQrInstanceId, setOpenQrInstanceId] = useState<string | null>(null);

  const formatQrCodeDataUrl = useCallback((qrCodeData: string) => {
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
  }, []);
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
    logger.info('Setting up realtime subscription for WhatsApp instances', {
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
      
      // Only update if meaningful fields have changed
      const meaningfulFieldsChanged = 
        previousInstance.status !== updatedInstance.status ||
        previousInstance.last_connected !== updatedInstance.last_connected ||
        previousInstance.reject_calls !== updatedInstance.reject_calls ||
        previousInstance.reject_calls_message !== updatedInstance.reject_calls_message;
      
      if (!meaningfulFieldsChanged) {
        logger.log('No meaningful changes detected, skipping state update');
        return;
      }
      
      setInstances(prevInstances => {
        const instanceIndex = prevInstances.findIndex(instance => instance.id === updatedInstance.id);
        if (instanceIndex === -1) return prevInstances;
        
        const newInstances = [...prevInstances];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          ...updatedInstance,
          qr_code: newInstances[instanceIndex].qr_code  // Preserve local qr_code data
        };
        return newInstances;
      });
      
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
  const handleCheckStatus = useCallback(async (instanceId: string, instanceName: string) => {
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
  }, []);

  // Debounce status checks to prevent excessive API calls
  const debouncedHandleCheckStatus = useMemo(() => {
    const debounce = (func: Function, wait: number) => {
      let timeout: NodeJS.Timeout;
      return function executedFunction(...args: any[]) {
        const later = () => {
          clearTimeout(timeout);
          func.apply(null, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    };
    
    return debounce(handleCheckStatus, 1000); // 1 second debounce
  }, [handleCheckStatus]);

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
        setInstances(prev => {
          const instanceIndex = prev.findIndex(instance => instance.instance_name === name);
          if (instanceIndex === -1) return prev;
          
          const newInstances = [...prev];
          newInstances[instanceIndex] = {
            ...newInstances[instanceIndex],
            status: updatedStatus,
            qr_code: updatedStatus === 'Connected' ? undefined : newInstances[instanceIndex].qr_code,
            last_connected: updatedStatus === 'Connected' ? new Date().toISOString() : newInstances[instanceIndex].last_connected
          };
          return newInstances;
        });
        
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
      setOpenQrInstanceId(instanceData.id);
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
  const handleDelete = useCallback(async (instanceId: string, instanceName: string) => {
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
  }, []);
  const handleLogout = useCallback(async (instanceId: string, instanceName: string) => {
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
      setInstances(prev => {
        const instanceIndex = prev.findIndex(instance => instance.id === instanceId);
        if (instanceIndex === -1) return prev;
        
        const newInstances = [...prev];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          status: 'Disconnected',
          last_connected: null
        };
        return newInstances;
      });
      toast.success('WhatsApp instance logged out successfully');
    } catch (error) {
      logger.error('Error logging out WhatsApp instance:', error);
      toast.error('Failed to logout WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  }, []);
  const handleReconnect = useCallback(async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      const {
        error: updateError
      } = await supabase.from('whatsapp_instances').update({
        status: 'Connecting'
      }).eq('id', instanceId);
      if (updateError) throw updateError;
      setInstances(prev => {
        const instanceIndex = prev.findIndex(instance => instance.id === instanceId);
        if (instanceIndex === -1) return prev;
        
        const newInstances = [...prev];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          status: 'Connecting'
        };
        return newInstances;
      });
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
      setInstances(prev => {
        const instanceIndex = prev.findIndex(instance => instance.id === instanceId);
        if (instanceIndex === -1) return prev;
        
        const newInstances = [...prev];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          status: 'Connecting',
          qr_code: qrCodeData
        };
        return newInstances;
      });
      setOpenQrInstanceId(instanceId);
      toast.success('Scan the QR code to reconnect your WhatsApp instance');
    } catch (error: any) {
      logger.error('Error reconnecting WhatsApp instance:', error);
      toast.error('Failed to reconnect WhatsApp instance');
      await supabase.from('whatsapp_instances').update({
        status: 'Disconnected'
      }).eq('id', instanceId);
      setInstances(prev => {
        const instanceIndex = prev.findIndex(instance => instance.id === instanceId);
        if (instanceIndex === -1) return prev;
        
        const newInstances = [...prev];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          status: 'Disconnected'
        };
        return newInstances;
      });
    } finally {
      setIsLoading(false);
    }
  }, []);
  const handleCallRejectionToggle = useCallback((instance: WhatsAppInstance) => {
    setSelectedInstanceForCallSettings(instance);
    setShowCallRejectionForm(true);
  }, []);
  const updateCallRejectionSettings = useCallback(async (instanceId: string, instanceName: string, enable: boolean, message?: string) => {
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
      setInstances(prevInstances => {
        const instanceIndex = prevInstances.findIndex(instance => instance.id === instanceId);
        if (instanceIndex === -1) return prevInstances;
        
        const newInstances = [...prevInstances];
        newInstances[instanceIndex] = {
          ...newInstances[instanceIndex],
          reject_calls: enable,
          reject_calls_message: message || newInstances[instanceIndex].reject_calls_message
        };
        return newInstances;
      });
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
  }, [showCallRejectionForm]);
  const handleCallRejectionSave = useCallback(async (message: string) => {
    if (!selectedInstanceForCallSettings) return;
    await updateCallRejectionSettings(selectedInstanceForCallSettings.id, selectedInstanceForCallSettings.instance_name, true, message);
  }, [selectedInstanceForCallSettings, updateCallRejectionSettings]);
  
  const handleCallRejectionCancel = useCallback(() => {
    setShowCallRejectionForm(false);
    setSelectedInstanceForCallSettings(null);
  }, []);
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
  if (authLoading || initialLoading) {
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
              <MessageSquare className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('whatsappInstances.loadingTitle')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('whatsappInstances.loadingDescription')}
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
  return <TooltipProvider>
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                {t('whatsappInstances.title')}
              </h1>
              <p className="mt-1 text-sm md:text-base text-slate-600 dark:text-slate-400">
                {instances.length} {t('whatsappInstances.instancesUsedOf')} {instanceLimit} {t('whatsappInstances.instancesUsed')}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Button onClick={() => setShowCreateForm(true)} disabled={instances.length >= instanceLimit || showCreateForm} size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white border-0 font-medium rounded-lg">
                <CirclePlus className="h-4 w-4" />
                {t('whatsappInstances.newInstance')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">

        {showCreateForm && <div>
            <Card className="mb-0 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <CardTitle className="text-xl md:text-2xl font-semibold">{t('whatsappInstances.createNewInstance')}</CardTitle>
                    <CardDescription className="mt-1">
                      {t('whatsappInstances.enterPhoneNumber')}
                    </CardDescription>
                  </div>
                  
                  <form onSubmit={e => {
                e.preventDefault();
                if (validateInstanceName(instanceName)) {
                  createInstance(instanceName);
                }
              }} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="instanceName" className="text-sm font-medium">{t('whatsappInstances.whatsappNumber')}</Label>
                    <Input id="instanceName" value={instanceName} onChange={e => {
                  const cleanedValue = cleanPhoneNumber(e.target.value);
                  setInstanceName(cleanedValue);
                  validateInstanceName(cleanedValue);
                }} placeholder={t('whatsappInstances.enterWhatsappNumber')} className={!isValidName ? 'border-red-500' : ''} required />
                    <p className="text-xs text-muted-foreground">
                      {t('whatsappInstances.copyPhoneNumberInstruction')}
                    </p>
                    {!isValidName && <p className="text-sm text-red-500">
                        {t('whatsappInstances.numberOnlyError')}
                      </p>}
                  </div>


                  {showProxyFields && (
                    <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('whatsappInstances.proxyConfiguration')}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="proxyHost">{t('whatsappInstances.proxyHost')}</Label>
                          <Input
                            id="proxyHost"
                            value={proxyHost}
                            onChange={e => setProxyHost(e.target.value)}
                            required={showProxyFields}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyPort">{t('whatsappInstances.proxyPort')}</Label>
                          <Input
                            id="proxyPort"
                            value={proxyPort}
                            onChange={e => setProxyPort(e.target.value)}
                            type="text"
                            required={showProxyFields}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyUsername">{t('whatsappInstances.proxyUsername')}</Label>
                          <Input
                            id="proxyUsername"
                            value={proxyUsername}
                            onChange={e => setProxyUsername(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxyPassword">{t('whatsappInstances.proxyPassword')}</Label>
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
                  <div className="flex flex-col sm:flex-row gap-3 justify-between">
                    <Button type="button" variant="outline" onClick={() => {
                  setShowCreateForm(false);
                  setInstanceName('');
                  setIsValidName(true);
                  setShowProxyFields(false);
                  setProxyHost('');
                  setProxyPort('');
                  setProxyUsername('');
                  setProxyPassword('');
                }} className="w-full sm:w-auto bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium border-0 rounded-lg" size="lg">
                      <X className="h-4 w-4" />
                      {t('whatsappInstances.cancel')}
                    </Button>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowProxyFields(!showProxyFields)}
                        className="w-full sm:w-auto rounded-lg bg-blue-100 hover:bg-blue-600 text-blue-900 hover:text-white font-medium"
                        size="lg"
                      >
                        <Cog className="h-4 w-4" />
                        {showProxyFields ? t('whatsappInstances.hideProxy') : t('whatsappInstances.addProxy')}
                      </Button>
                      <Button type="submit" disabled={isLoading || !isValidName || !instanceName || (showProxyFields && (!proxyHost || !proxyPort))} size="lg" className="w-full sm:w-auto rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
                        {isLoading ? <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('whatsappInstances.creating')}
                          </> : <>
                            <CirclePlus className="h-4 w-4" />
                            {t('whatsappInstances.createInstance')}
                          </>}
                      </Button>
                    </div>
                    </div>
                  </form>
                </div>
              </CardContent>
            </Card>
          </div>}

        {showCallRejectionForm && selectedInstanceForCallSettings && <CallRejectionForm instance={selectedInstanceForCallSettings} onCancel={handleCallRejectionCancel} onSave={handleCallRejectionSave} isLoading={isLoading} t={t} />}

        {instances.length > 0 ? <div>
            {/* Desktop Table View - Hidden on Mobile */}
            <Card className="hidden md:block rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px] min-w-[150px]">{t('whatsappInstances.instance')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('whatsappInstances.status')}</TableHead>
                      <TableHead className="text-center min-w-[120px]">{t('whatsappInstances.aiAssistant')}</TableHead>
                      <TableHead className="text-center min-w-[120px] hidden md:table-cell">{t('whatsappInstances.callRejection')}</TableHead>
                      <TableHead className="text-right min-w-[120px]">{t('whatsappInstances.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                    {instances.map(instance => <TableRow key={instance.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div className="font-semibold text-base">{instance.instance_name}</div>
                          {instance.last_connected && <div className="text-sm text-muted-foreground">
                            </div>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={instance.status} t={t} />
                        </TableCell>
                        <TableCell className="text-center">
                          <WhatsAppAIToggle instanceId={instance.id} instanceName={instance.instance_name} instanceStatus={instance.status} />
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <CallRejectionToggle instance={instance} onSettings={() => handleCallRejectionToggle(instance)} onToggle={enabled => updateCallRejectionSettings(instance.id, instance.instance_name, enabled)} isLoading={isLoading} t={t} />
                        </TableCell>
                        <TableCell className="text-right">
                          <InstanceActions
                            instance={instance}
                            isLoading={isLoading}
                            onLogout={() => handleLogout(instance.id, instance.instance_name)}
                            onReconnect={() => handleReconnect(instance.id, instance.instance_name)}
                            onDelete={() => handleDelete(instance.id, instance.instance_name)}
                            onToggleCallRejection={() => handleCallRejectionToggle(instance)}
                            onCheckStatus={() => debouncedHandleCheckStatus(instance.id, instance.instance_name)}
                            formatQrCodeDataUrl={formatQrCodeDataUrl}
                            isQrOpen={openQrInstanceId === instance.id}
                            onQrOpenChange={(open) => setOpenQrInstanceId(open ? instance.id : null)}
                            t={t}
                          />
                        </TableCell>
                      </TableRow>)}
                </TableBody>
                </Table>
              </div>
            </Card>

            {/* Mobile Card View - Shown on Mobile Only */}
            <div className="md:hidden space-y-4">
              {instances.map(instance => (
                <Card key={instance.id} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardContent className="p-4">
                    {/* Instance Name and Status in Same Row */}
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {instance.instance_name}
                      </h3>
                      <StatusBadge status={instance.status} t={t} />
                    </div>

                    {/* AI Assistant Toggle - Clear and Visible */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('whatsappInstances.aiAssistant')}
                        </label>
                        <WhatsAppAIToggle instanceId={instance.id} instanceName={instance.instance_name} instanceStatus={instance.status} />
                      </div>
                    </div>

                    {/* Call Rejection Toggle - Mobile Friendly */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('whatsappInstances.callRejection')}
                        </label>
                        <CallRejectionToggle
                          instance={instance}
                          onSettings={() => handleCallRejectionToggle(instance)}
                          onToggle={enabled => updateCallRejectionSettings(instance.id, instance.instance_name, enabled)}
                          isLoading={isLoading}
                          t={t}
                        />
                      </div>
                    </div>

                    {/* Actions Row at Bottom */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                      <InstanceActions
                        instance={instance}
                        isLoading={isLoading}
                        onLogout={() => handleLogout(instance.id, instance.instance_name)}
                        onReconnect={() => handleReconnect(instance.id, instance.instance_name)}
                        onDelete={() => handleDelete(instance.id, instance.instance_name)}
                        onToggleCallRejection={() => handleCallRejectionToggle(instance)}
                        onCheckStatus={() => debouncedHandleCheckStatus(instance.id, instance.instance_name)}
                        formatQrCodeDataUrl={formatQrCodeDataUrl}
                        isQrOpen={openQrInstanceId === instance.id}
                        onQrOpenChange={(open) => setOpenQrInstanceId(open ? instance.id : null)}
                        t={t}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div> : <EmptyState onCreateClick={() => setShowCreateForm(true)} t={t} />}
      </div>
    </div>
  </TooltipProvider>;
};
export default WhatsAppLink;