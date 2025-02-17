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

const WhatsAppLink = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState('Not connected');
  const [substatus, setSubstatus] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInstance();
    }
  }, [user]);

  const fetchInstance = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found error
          throw error;
        }
        return;
      }

      if (data) {
        setInstanceName(data.instance_name);
        setIsConfigured(true);
        setCurrentInstanceId(data.id);
        await checkInstanceStatus(data.instance_name);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp instance:', error);
      toast.error('Failed to fetch WhatsApp instance');
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
      
      if (data.instance) {
        const state = data.instance.state;
        setStatus(state || 'Not connected');
        
        if (data.instance.qrcode) {
          setQrCode(data.instance.qrcode);
          setSubstatus('Please scan the QR code with WhatsApp');
        } else if (state === 'open') {
          setSubstatus('WhatsApp connected successfully!');
          setQrCode('');
          if (currentInstanceId) {
            await supabase
              .from('whatsapp_instances')
              .update({ 
                status: 'CONNECTED',
                last_connected: new Date().toISOString()
              })
              .eq('id', currentInstanceId);
          }
        } else {
          setSubstatus(data.instance.statusReason || 'Waiting for connection...');
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
      
      try {
        await supabase
          .from('whatsapp_connection_logs')
          .insert({
            instance_id: instanceData.id,
            status: 'CREATED',
            details: data
          });
      } catch (logError) {
        console.warn('Failed to log connection attempt:', logError);
      }

      toast.success('WhatsApp instance created successfully');
      
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      let attempts = 0;
      const maxAttempts = 20;
      const baseDelay = 5000; // 5 seconds base delay
      
      const checkQRCode = async () => {
        if (attempts >= maxAttempts) {
          setStatus('Failed to get QR code');
          setSubstatus('Please try again');
          return;
        }
        
        try {
          console.log(`Attempt ${attempts + 1}/${maxAttempts}`);
          await checkInstanceStatus(instanceName);
          attempts++;
          
          if (!qrCode && status !== 'CONNECTED') {
            const delay = baseDelay + (attempts * 1000);
            console.log(`Scheduling next check in ${delay}ms`);
            setTimeout(checkQRCode, delay);
          }
        } catch (error) {
          console.error('Error in polling:', error);
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkQRCode, baseDelay);
          }
        }
      };
      
      checkQRCode();
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
    if (isConfigured && instanceName) {
      const interval = setInterval(() => {
        checkInstanceStatus(instanceName);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isConfigured, instanceName]);

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
                {isLoading ? 'Creating Instance...' : 'Create Instance'}
              </Button>
            </form>
          ) : (
            <>
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">{status}</p>
                {substatus && <p className="text-sm text-muted-foreground">{substatus}</p>}
              </div>
              {qrCode && (
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img 
                    src={`data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR Code" 
                    className="max-w-full h-auto"
                  />
                </div>
              )}
              {!qrCode && status !== 'CONNECTED' && (
                <div className="text-center p-4">
                  <p className="text-muted-foreground">QR code will appear here when ready</p>
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
