import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Plus, Check, X, MoreVertical, RefreshCw, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  last_connected: string | null;
  qr_code?: string;
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

const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium",
      config.color,
      status === "CONNECTING" && "animate-pulse"
    )}>
      <Icon className={cn("w-4 h-4 mr-1.5", config.animation)} />
      {config.label}
    </div>
  );
};

const InstanceActions = ({ 
  instance, 
  isLoading, 
  onLogout, 
  onReconnect, 
  onDelete 
}: { 
  instance: WhatsAppInstance;
  isLoading: boolean;
  onLogout: () => void;
  onReconnect: () => void;
  onDelete: () => void;
}) => {
  return (
    <TooltipProvider>
      <div className="flex items-center justify-end space-x-2">
        {instance.status === 'CONNECTED' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                onClick={onLogout}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Disconnect this WhatsApp instance</p>
            </TooltipContent>
          </Tooltip>
        )}
        
        {instance.status === 'DISCONNECTED' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                onClick={onReconnect}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reconnect this WhatsApp instance</p>
            </TooltipContent>
          </Tooltip>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
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
    </TooltipProvider>
  );
};

const WhatsAppLink = () => {
  const { user, loading: authLoading } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instanceName, setInstanceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
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

  const fetchUserProfile = async () => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('instance_limit')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      setInstanceLimit(profile.instance_limit);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to fetch user profile');
    }
  };

  const fetchInstances = async () => {
    try {
      setInitialLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;

      setInstances(data || []);
      await Promise.all(data?.map(instance => checkInstanceStatus(instance.instance_name)) || []);
    } catch (error) {
      console.error('Error fetching WhatsApp instances:', error);
      toast.error('Failed to fetch WhatsApp instances');
    } finally {
      setInitialLoading(false);
    }
  };

  const checkInstanceStatus = async (name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-instance-status', {
        body: { instanceName: name.trim() }
      });
      
      if (error) throw error;
      
      if (data) {
        const state = data.state;
        const statusReason = data.statusReason;
        
        const updatedStatus = 
          state === 'open' || state === 'CONNECTED' ? 'CONNECTED' :
          state === 'connecting' || state === 'STARTING' ? 'CONNECTING' :
          state === 'qrcode' ? 'CONNECTING' : // Keep as CONNECTING when showing QR
          'DISCONNECTED';

        if (updatedStatus === 'CONNECTED') {
          await supabase
            .from('whatsapp_instances')
            .update({ 
              status: updatedStatus,
              last_connected: new Date().toISOString()
            })
            .eq('instance_name', name);
        }

        setInstances(prev => prev.map(instance => 
          instance.instance_name === name 
            ? { 
                ...instance, 
                status: updatedStatus,
                qr_code: updatedStatus === 'CONNECTED' ? undefined : instance.qr_code,
                last_connected: updatedStatus === 'CONNECTED' ? new Date().toISOString() : instance.last_connected
              }
            : instance
        ));

        return updatedStatus === 'CONNECTED';
      }
      return false;
    } catch (error: any) {
      console.error('Status check error:', error);
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
      const { data, error } = await supabase.functions.invoke('whatsapp-instance-create', {
        body: { instanceName }
      });

      if (error) throw error;
      
      console.log('Response from create:', data);
      
      const qrCodeData = extractQRCode(data);
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }
      
      const { data: instanceData, error: dbError } = await supabase
        .from('whatsapp_instances')
        .insert({
          user_id: user?.id,
          instance_name: instanceName,
          status: 'CREATED'
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setInstances(prev => [...prev, { ...instanceData, qr_code: qrCodeData }]);
      setShowCreateForm(false);
      setInstanceName('');
      
    } catch (error: any) {
      console.error('Error creating WhatsApp instance:', error);
      toast.error(`Failed to create WhatsApp instance: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      const { error } = await supabase.functions.invoke('whatsapp-instance-delete', {
        body: { instanceName }
      });

      if (error) throw error;

      await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId);

      setInstances(prev => prev.filter(instance => instance.id !== instanceId));
      toast.success('WhatsApp instance deleted successfully');
    } catch (error) {
      console.error('Error deleting WhatsApp instance:', error);
      toast.error('Failed to delete WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      const { error } = await supabase.functions.invoke('whatsapp-instance-logout', {
        body: { instanceName }
      });

      if (error) throw error;

      await supabase
        .from('whatsapp_instances')
        .update({ 
          status: 'DISCONNECTED',
          last_connected: null 
        })
        .eq('id', instanceId);

      setInstances(prev => prev.map(instance => 
        instance.id === instanceId 
          ? { ...instance, status: 'DISCONNECTED', last_connected: null }
          : instance
      ));

      toast.success('WhatsApp instance logged out successfully');
    } catch (error) {
      console.error('Error logging out WhatsApp instance:', error);
      toast.error('Failed to logout WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({ status: 'CONNECTING' })
        .eq('id', instanceId);

      if (updateError) throw updateError;

      setInstances(prev => prev.map(instance => 
        instance.id === instanceId 
          ? { ...instance, status: 'CONNECTING' }
          : instance
      ));

      const { data, error } = await supabase.functions.invoke('whatsapp-instance-connect', {
        body: { instanceName: instanceName.trim() }
      });

      if (error) throw error;

      console.log('Response from reconnect:', data);
      
      const qrCodeData = extractQRCode(data);
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }

      setInstances(prev => prev.map(instance => 
        instance.id === instanceId 
          ? { ...instance, status: 'CONNECTING', qr_code: qrCodeData }
          : instance
      ));
      toast.success('Scan the QR code to reconnect your WhatsApp instance');
    } catch (error: any) {
      console.error('Error reconnecting WhatsApp instance:', error);
      toast.error('Failed to reconnect WhatsApp instance');
      
      await supabase
        .from('whatsapp_instances')
        .update({ status: 'DISCONNECTED' })
        .eq('id', instanceId);

      setInstances(prev => prev.map(instance => 
        instance.id === instanceId 
          ? { ...instance, status: 'DISCONNECTED' }
          : instance
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const validateInstanceName = (name: string) => {
    const isValid = /^[a-zA-Z0-9]+$/.test(name);
    setIsValidName(isValid);
    return isValid;
  };

  const extractQRCode = (data: any): string | null => {
    console.log('Extracting QR code from response:', data);
    
    if (data.base64 && data.base64.startsWith('data:image/')) {
      console.log('Found ready-to-use base64 image');
      return data.base64;
    }
    
    if (data.qrcode) {
      console.log('Found QR code in qrcode object');
      const qrData = data.qrcode.base64 || data.qrcode.code || data.qrcode;
      if (qrData) {
        return qrData.startsWith('data:image/') ? qrData : `data:image/png;base64,${qrData}`;
      }
    }
    
    if (data.code) {
      console.log('Found QR code in code field');
      return data.code.startsWith('data:image/') ? data.code : `data:image/png;base64,${data.code}`;
    }
    
    console.log('No QR code found in response');
    return null;
  };

  const formatQrCodeDataUrl = (qrCodeData: string) => {
    if (!qrCodeData) return '';
    
    try {
      if (qrCodeData.startsWith('data:image/')) {
        return qrCodeData;
      }
      
      const cleanBase64 = qrCodeData
        .trim()
        .replace(/[\n\r\s]/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      return `data:image/png;base64,${cleanBase64}`;
    } catch (error) {
      console.error('Error formatting QR code:', error);
      return '';
    }
  };

  useEffect(() => {
    const instancePolling = instances.map(instance => {
      let intervalId: ReturnType<typeof setInterval>;

      if (
        (instance.status === 'CONNECTING' && !instance.qr_code) ||
        (instance.status === 'CONNECTING' && instance.last_connected)
      ) {
        intervalId = setInterval(async () => {
          const isConnected = await checkInstanceStatus(instance.instance_name);
          if (isConnected) {
            clearInterval(intervalId);
            toast.success(`WhatsApp instance ${instance.instance_name} connected successfully`);
          }
        }, 3000);
      }

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    });

    return () => {
      instancePolling.forEach(cleanup => cleanup());
    };
  }, [instances]);

  if (authLoading || initialLoading) {
    return (
      <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p>Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              Please log in to access WhatsApp linking.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 sm:px-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold">WhatsApp Instances</h1>
          <p className="text-sm text-muted-foreground">
            {instances.length} of {instanceLimit} instances used
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          disabled={instances.length >= instanceLimit || showCreateForm}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Instance
        </Button>
      </div>

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Instance</CardTitle>
            <CardDescription>
              Enter a unique name using only letters and numbers (no spaces or special characters)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (validateInstanceName(instanceName)) {
                  createInstance(instanceName);
                }
              }} 
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="instanceName">Instance Name</Label>
                <Input
                  id="instanceName"
                  value={instanceName}
                  onChange={(e) => {
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
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Instance'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowCreateForm(false);
                    setInstanceName('');
                    setIsValidName(true);
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {instances.map((instance) => (
          <Card 
            key={instance.id} 
            className="flex flex-col transition-all duration-200 hover:shadow-lg"
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{instance.instance_name}</CardTitle>
                <StatusBadge status={instance.status} />
              </div>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="space-y-4">
                {(instance.status === 'CREATED' || instance.status === 'CONNECTING') && instance.qr_code && (
                  <div className="flex flex-col items-center space-y-2">
                    <p className="text-sm font-medium">Scan QR Code to Connect</p>
                    <img 
                      src={instance.qr_code}
                      alt="WhatsApp QR Code" 
                      className="w-full max-w-[200px] h-auto mx-auto"
                    />
                  </div>
                )}
                <InstanceActions
                  instance={instance}
                  isLoading={isLoading}
                  onLogout={() => handleLogout(instance.id, instance.instance_name)}
                  onReconnect={() => handleReconnect(instance.id, instance.instance_name)}
                  onDelete={() => handleDelete(instance.id, instance.instance_name)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {instances.length === 0 && !showCreateForm && (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              No WhatsApp instances found. Click the "New Instance" button to create one.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WhatsAppLink;
