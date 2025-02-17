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
      const { data, error } = await supabase.functions.invoke('whatsapp-instance-status', {
        body: { instanceName: name }
      });
      
      if (error) throw error;
      
      if (data.instance) {
        setStatus(data.instance.state || 'DISCONNECTED');
        if (data.instance.qrcode) {
          setQrCode(data.instance.qrcode);
        }
      }
    } catch (error) {
      console.error('Error checking instance status:', error);
      setStatus('Error checking status');
    }
  };

  const createInstance = async (instanceName: string) => {
    try {
      console.log('Calling createInstance with:', instanceName); // Debug log

      const { data, error } = await supabase.functions.invoke('whatsapp-instance-create', {
        body: { instanceName },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Response from Edge Function:', { data, error }); // Debug log

      if (error) throw error;
      
      // Store instance in database
      const { data: instanceData, error: dbError } = await supabase
        .from('whatsapp_instances')
        .insert({
          user_id: user?.id,
          instance_name: instanceName,
          status: 'CREATED'
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError); // Debug log
        throw dbError;
      }

      setCurrentInstanceId(instanceData.id);
      setIsConfigured(true);
      
      // Log connection attempt
      await supabase
        .from('whatsapp_connection_logs')
        .insert({
          instance_id: instanceData.id,
          status: 'CREATED',
          details: data
        });

      toast.success('WhatsApp instance created');
      
      // Start polling for QR code and status
      await checkInstanceStatus(instanceName);
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      toast.error(`Failed to create WhatsApp instance: ${error.message}`);
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
        // Delete instance from Evolution API
        const { error } = await supabase.functions.invoke('whatsapp-instance-delete', {
          body: { instanceName }
        });

        if (error) throw error;

        // Delete from database
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
      }, 5000); // Poll every 5 seconds

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
              <Button type="submit" className="w-full">
                Create Instance
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
