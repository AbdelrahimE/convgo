
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from '@/components/ui/card';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { 
  Loader2, 
  Plus, 
  Check, 
  X, 
  RefreshCw, 
  LogOut, 
  Trash2, 
  MessageSquare, 
  ArrowRight, 
  Bot 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import logger from '@/utils/logger';
import { isConnectionStatusEvent } from '@supabase/functions/_shared/connection-event-detector';
import { logWebhook } from '@/utils/webhook-logger';

// Types
interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  last_connected: string | null;
  qr_code?: string;
  user_id: string;
}

// Status badge configuration
const statusConfig = {
  "CONNECTED": {
    color: "text-green-500 bg-green-50 dark:bg-green-950/50",
    icon: Check,
    animation: "",
    label: "Connected"
  },
  "DISCONNECTED": {
    color: "text-red-500 bg-red-50 dark:bg-red-950/50",
    icon: X,
    animation: "",
    label: "Disconnected"
  },
  "CONNECTING": {
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50",
    icon: Loader2,
    animation: "animate-spin",
    label: "Connecting"
  },
  "CREATED": {
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/50",
    icon: Loader2,
    animation: "animate-spin",
    label: "Connecting"
  }
};

// Component to display status badges
const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DISCONNECTED;
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

// Component for instance actions (logout, reconnect, delete)
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
                className="w-full sm:w-auto font-semibold"
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
              className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600 text-center font-semibold"
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

// Empty state component for when no instances exist
const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => {
  return (
    <Card className="w-full mx-auto bg-background">
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
              {[
                {
                  title: "Create an Instance",
                  description: "Set up your first WhatsApp connection",
                  icon: Plus
                },
                {
                  title: "Scan QR Code",
                  description: "Link your WhatsApp account securely",
                  icon: MessageSquare
                },
                {
                  title: "Start Automating",
                  description: "Let AI handle your customer inquiries",
                  icon: Bot
                }
              ].map((step, index) => (
                <div key={index} className="flex items-start space-x-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm md:text-base font-medium">{step.title}</h4>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={onCreateClick} size="lg" className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600">
              Create Your First Instance
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main WhatsApp Instance Manager Component
const WhatsAppInstanceManager = () => {
  const { user, loading: authLoading } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instanceName, setInstanceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [instanceLimit, setInstanceLimit] = useState(0);
  const [isValidName, setIsValidName] = useState(true);
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);

  // Load instances when user is authenticated
  useEffect(() => {
    if (!authLoading && user) {
      fetchInstances();
      fetchUserProfile();
    } else if (!authLoading) {
      setInitialLoading(false);
    }
  }, [user, authLoading]);

  // Set up realtime subscription for instance updates
  useEffect(() => {
    if (!user) return;
    
    logWebhook('Setting up realtime subscription for WhatsApp instances', { userId: user.id });
    
    const channel = supabase
      .channel('whatsapp-instances-changes')
      .on('postgres_changes', 
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`
        }, 
        (payload) => {
          logger.log('Received real-time update for WhatsApp instance:', payload);
          
          const updatedInstance = payload.new as WhatsAppInstance;
          
          setInstances(prevInstances => 
            prevInstances.map(instance => 
              instance.id === updatedInstance.id ? {...instance, ...updatedInstance} : instance
            )
          );
          
          if (updatedInstance.status === 'CONNECTED') {
            const instanceName = updatedInstance.instance_name;
            toast.success(`WhatsApp instance ${instanceName} connected successfully`);
          }
        }
      )
      .subscribe((status) => {
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

  // Fetch user profile to get instance limit
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
      logger.error('Error fetching user profile:', error);
      toast.error('Failed to fetch user profile');
    }
  };

  // Fetch instances from database
  const fetchInstances = async () => {
    try {
      setInitialLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user?.id);
        
      if (error) throw error;
      setInstances(data || []);
      
      // Check each instance's status with the server
      await Promise.all(data?.map(instance => checkInstanceStatus(instance.instance_name)) || []);
    } catch (error) {
      logger.error('Error fetching WhatsApp instances:', error);
      toast.error('Failed to fetch WhatsApp instances');
    } finally {
      setInitialLoading(false);
    }
  };

  // Check instance status against the Evolution API
  const checkInstanceStatus = async (name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'status',
          instanceName: name.trim()
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        // Extract state from response
        const responseData = data.data;
        const state = responseData.state;
        const statusReason = responseData.statusReason;
        
        // Map API status to our database status
        const updatedStatus = 
          state === 'open' || state === 'CONNECTED' ? 'CONNECTED' : 
          state === 'connecting' || state === 'STARTING' ? 'CONNECTING' : 
          state === 'qrcode' ? 'CONNECTING' : 'DISCONNECTED';
        
        // Update database if connected
        if (updatedStatus === 'CONNECTED') {
          await supabase
            .from('whatsapp_instances')
            .update({
              status: updatedStatus,
              last_connected: new Date().toISOString()
            })
            .eq('instance_name', name);
        }
        
        // Update local state
        setInstances(prev => prev.map(instance => 
          instance.instance_name === name ? {
            ...instance,
            status: updatedStatus,
            qr_code: updatedStatus === 'CONNECTED' ? undefined : instance.qr_code,
            last_connected: updatedStatus === 'CONNECTED' ? new Date().toISOString() : instance.last_connected
          } : instance
        ));
        
        return updatedStatus === 'CONNECTED';
      }
      
      return false;
    } catch (error) {
      logger.error('Status check error:', error);
      return false;
    }
  };

  // Create a new WhatsApp instance
  const createInstance = async (name: string) => {
    try {
      if (instances.length >= instanceLimit) {
        toast.error(`You have reached your limit of ${instanceLimit} instances`);
        return;
      }
      
      setIsLoading(true);
      
      // Call the evolution-api edge function to create an instance
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'create',
          instanceName: name.trim()
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create instance');
      
      logger.log('Response from create:', data);
      
      // Extract QR code from response
      const responseData = data.data;
      const qrCodeData = extractQrCode(responseData);
      
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }
      
      // Insert the new instance into the database
      const { data: instanceData, error: dbError } = await supabase
        .from('whatsapp_instances')
        .insert({
          user_id: user?.id,
          instance_name: name.trim(),
          status: 'CREATED'
        })
        .select()
        .single();
        
      if (dbError) throw dbError;
      
      // Add the new instance to state
      setInstances(prev => [...prev, {
        ...instanceData,
        qr_code: qrCodeData
      }]);
      
      setShowCreateForm(false);
      setInstanceName('');
      toast.success('WhatsApp instance created. Scan the QR code to connect.');
    } catch (error) {
      logger.error('Error creating WhatsApp instance:', error);
      toast.error(`Failed to create WhatsApp instance: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a WhatsApp instance
  const handleDelete = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      // Call the evolution-api to delete the instance
      const { error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'delete',
          instanceName: instanceName.trim()
        }
      });
      
      if (error) throw error;
      
      // Delete from database
      await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId);
      
      // Remove from state
      setInstances(prev => prev.filter(instance => instance.id !== instanceId));
      toast.success('WhatsApp instance deleted successfully');
    } catch (error) {
      logger.error('Error deleting WhatsApp instance:', error);
      toast.error('Failed to delete WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };

  // Logout/disconnect a WhatsApp instance
  const handleLogout = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      // Call the evolution-api to logout
      const { error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'logout',
          instanceName: instanceName.trim()
        }
      });
      
      if (error) throw error;
      
      // Update the instance status in database
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'DISCONNECTED',
          last_connected: null
        })
        .eq('id', instanceId);
      
      // Update state
      setInstances(prev => prev.map(instance => 
        instance.id === instanceId ? {
          ...instance,
          status: 'DISCONNECTED',
          last_connected: null
        } : instance
      ));
      
      toast.success('WhatsApp instance logged out successfully');
    } catch (error) {
      logger.error('Error logging out WhatsApp instance:', error);
      toast.error('Failed to logout WhatsApp instance');
    } finally {
      setIsLoading(false);
    }
  };

  // Reconnect a WhatsApp instance
  const handleReconnect = async (instanceId: string, instanceName: string) => {
    try {
      setIsLoading(true);
      
      // Update status to connecting
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({
          status: 'CONNECTING'
        })
        .eq('id', instanceId);
        
      if (updateError) throw updateError;
      
      // Update state
      setInstances(prev => prev.map(instance => 
        instance.id === instanceId ? {
          ...instance,
          status: 'CONNECTING'
        } : instance
      ));
      
      // Call the evolution-api to get a new QR code
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'connect',
          instanceName: instanceName.trim()
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to reconnect instance');
      
      logger.log('Response from reconnect:', data);
      
      // Extract QR code
      const responseData = data.data;
      const qrCodeData = extractQrCode(responseData);
      
      if (!qrCodeData) {
        throw new Error('No QR code received from server');
      }
      
      // Update state with new QR code
      setInstances(prev => prev.map(instance => 
        instance.id === instanceId ? {
          ...instance,
          status: 'CONNECTING',
          qr_code: qrCodeData
        } : instance
      ));
      
      toast.success('Scan the QR code to reconnect your WhatsApp instance');
    } catch (error) {
      logger.error('Error reconnecting WhatsApp instance:', error);
      toast.error('Failed to reconnect WhatsApp instance');
      
      // Reset status to disconnected on error
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'DISCONNECTED'
        })
        .eq('id', instanceId);
        
      setInstances(prev => prev.map(instance => 
        instance.id === instanceId ? {
          ...instance,
          status: 'DISCONNECTED'
        } : instance
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // Validate instance name (only letters and numbers)
  const validateInstanceName = (name: string) => {
    const isValid = /^[a-zA-Z0-9]+$/.test(name);
    setIsValidName(isValid);
    return isValid;
  };

  // Extract QR code from API response
  const extractQrCode = (data: any): string | null => {
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

  // Loading state
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

  // Not authenticated
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

  // Main render
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.3 }} 
      className="container mx-auto px-4 py-8 max-w-7xl"
    >
      <div className="space-y-8">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.2 }} 
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
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.3 }}
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

        {instances.length > 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.4 }}
          >
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {instances.map(instance => (
                <Card 
                  key={instance.id} 
                  className="flex flex-col transition-all duration-200 hover:shadow-lg"
                  onMouseEnter={() => setHoveredInstanceId(instance.id)}
                  onMouseLeave={() => setHoveredInstanceId(null)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base md:text-lg font-bold">
                        {instance.instance_name}
                      </CardTitle>
                      <StatusBadge status={instance.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    {(instance.status === 'CREATED' || instance.status === 'CONNECTING') && instance.qr_code && (
                      <div className="flex flex-col items-center space-y-2 mb-4">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ) : (
          !showCreateForm && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.4 }}
            >
              <EmptyState onCreateClick={() => setShowCreateForm(true)} />
            </motion.div>
          )
        )}
      </div>
    </motion.div>
  );
};

export default WhatsAppInstanceManager;
