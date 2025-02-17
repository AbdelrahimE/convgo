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
import { Loader2 } from "lucide-react";

const WhatsAppLink = () => {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('Not connected');
  const [substatus, setSubstatus] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchInstance();
      } else {
        setInitialLoading(false);
      }
    }
  }, [user, authLoading]);

  const fetchInstance = async () => {
    try {
      setInitialLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setInstanceName(data.instance_name);
        setIsConfigured(true);
        setCurrentInstanceId(data.id);
        await checkInstanceStatus(data.instance_name);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp instance:', error);
      toast.error('Failed to fetch WhatsApp instance');
    } finally {
      setInitialLoading(false);
    }
  };

  const checkInstanceStatus = async (name: string) => {
    try {
      console.log('Checking instance status:', name);
      const { data, error } = await supabase.functions.invoke('whatsapp-instance-status', {
        body: { instanceName: name }
      });
      
      if (error) throw error;
      
      console.log('Status check response:', data);
      
      if (data) {
        const state = data.state;
        
        switch(state) {
          case 'open':
            setStatus('Connected');
            setSubstatus('WhatsApp connected successfully!');
            setQrCode(''); // Clear QR code when connected
            if (currentInstanceId) {
              await supabase
                .from('whatsapp_instances')
                .update({ 
                  status: 'CONNECTED',
                  last_connected: new Date().toISOString()
                })
                .eq('id', currentInstanceId);
            }
            break;
          case 'connecting':
            setStatus('Connecting');
            setSubstatus('Connecting to WhatsApp...');
            break;
          case 'close':
            setStatus('Not connected');
            setSubstatus(data.statusReason || 'Waiting for QR code scan...');
            break;
          default:
            setStatus('Not connected');
            setSubstatus('Unknown connection state');
        }
      }
    } catch (error) {
      console.error('Status check error:', error);
      setStatus('Error checking status');
      setSubstatus(error.message);
    }
  };

  const createInstance = async (instanceName: string) => {
    try {
      setIsLoading(true);
      setStatus('Creating instance...');
      setSubstatus('Please wait...');

      const { data, error } = await supabase.functions.invoke('whatsapp-instance-create', {
        body: { instanceName }
      });

      if (error) throw error;
      
      console.log('Instance creation response:', data);

      // Handle QR code from response
      const qrCodeData = data.qrcode?.base64 || data.qrcode;
      if (qrCodeData) {
        console.log('Received QR code data');
        setQrCode(qrCodeData);
        setSubstatus('Please scan the QR code with WhatsApp');
      } else {
        console.error('No QR code received in response');
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

      setCurrentInstanceId(instanceData.id);
      setIsConfigured(true);
      
      toast.success('WhatsApp instance created successfully');
      
    } catch (error: any) {
      console.error('Error creating WhatsApp instance:', error);
      toast.error(`Failed to create WhatsApp instance: ${error.message}`);
      setStatus('Error');
      setSubstatus(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!instanceName.trim()) {
      toast.error('Please enter an instance name');
      return;
    }

    await createInstance(instanceName);
  };

  const handleReset = async () => {
    try {
      if (currentInstanceId) {
        const { error } = await supabase.functions.invoke('whatsapp-instance-delete', {
          body: { instanceName }
        });

        if (error) throw error;

        const { error: dbError } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', currentInstanceId);

        if (dbError) throw dbError;
      }

      setInstanceName('');
      setIsConfigured(false);
      setStatus('Not connected');
      setSubstatus('');
      setQrCode('');
      setCurrentInstanceId(null);
      toast.success('WhatsApp instance reset');
    } catch (error) {
      console.error('Error resetting WhatsApp instance:', error);
      toast.error('Failed to reset WhatsApp instance');
    }
  };

  useEffect(() => {
    if (isConfigured && instanceName && !initialLoading) {
      const interval = setInterval(() => {
        checkInstanceStatus(instanceName);
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [isConfigured, instanceName, initialLoading]);

  if (authLoading || initialLoading) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
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
      <div className="container mx-auto max-w-2xl py-8">
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
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Link WhatsApp Account</CardTitle>
          <CardDescription>
            {isConfigured 
              ? 'Scan the QR code with your WhatsApp to connect your account'
              : 'Enter a name for your WhatsApp instance to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Instance Name</Label>
                <Input
                  id="instanceName"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Enter a name for your WhatsApp instance"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Instance...
                  </>
                ) : (
                  'Create Instance'
                )}
              </Button>
            </form>
          ) : (
            <>
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">{status}</p>
                {substatus && <p className="text-sm text-muted-foreground">{substatus}</p>}
              </div>
              {qrCode && status !== 'Connected' && (
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img 
                    src={`data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR Code" 
                    className="max-w-full h-auto"
                  />
                </div>
              )}
              <Button 
                variant="destructive" 
                onClick={handleReset}
                className="w-full"
              >
                Reset Instance
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppLink;
