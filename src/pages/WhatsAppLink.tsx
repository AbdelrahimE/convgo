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
import { Loader2, Plus } from "lucide-react";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  last_connected: string | null;
  qr_code?: string;
}

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
          'DISCONNECTED';

        await supabase
          .from('whatsapp_instances')
          .update({ 
            status: updatedStatus,
            last_connected: updatedStatus === 'CONNECTED' ? new Date().toISOString() : null
          })
          .eq('instance_name', name);

        setInstances(prev => prev.map(instance => 
          instance.instance_name === name 
            ? { 
                ...instance, 
                status: updatedStatus,
                qr_code: updatedStatus === 'CONNECTED' ? undefined : instance.qr_code
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
      
      const qrCodeData = data.qrcode?.base64 || data.qrcode;
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

  const validateInstanceName = (name: string) => {
    const isValid = /^[a-zA-Z0-9]+$/.test(name);
    setIsValidName(isValid);
    return isValid;
  };

  useEffect(() => {
    const instancePolling = instances.map(instance => {
      let intervalId: ReturnType<typeof setInterval>;

      if (instance.status !== 'CONNECTED') {
        intervalId = setInterval(async () => {
          const isConnected = await checkInstanceStatus(instance.instance_name);
          if (isConnected) {
            clearInterval(intervalId);
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
    <div className="container mx-auto max-w-5xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Instances</h1>
          <p className="text-sm text-muted-foreground">
            {instances.length} of {instanceLimit} instances used
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          disabled={instances.length >= instanceLimit || showCreateForm}
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
              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={isLoading || !isValidName || !instanceName}
                  className="flex-1"
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
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {instances.map((instance) => (
          <Card key={instance.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{instance.instance_name}</CardTitle>
              <CardDescription>
                Status: {instance.status.toLowerCase()}
              </CardDescription>
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
                {instance.last_connected && (
                  <p className="text-sm text-muted-foreground">
                    Last connected: {new Date(instance.last_connected).toLocaleString()}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {instance.status === 'CONNECTED' && (
                    <Button
                      variant="secondary"
                      onClick={() => handleLogout(instance.id, instance.instance_name)}
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging out...
                        </>
                      ) : (
                        'Logout'
                      )}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(instance.id, instance.instance_name)}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete Instance'
                    )}
                  </Button>
                </div>
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
