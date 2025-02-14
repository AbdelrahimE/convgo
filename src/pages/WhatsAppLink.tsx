
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
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
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [socket, setSocket] = useState<any>(null);

  // Fetch existing configuration
  useEffect(() => {
    if (user) {
      fetchConfig();
    }
  }, [user]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('instance_id, token')
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setInstanceId(data.instance_id);
        setToken(data.token);
        setIsConfigured(true);
        initializeSocket(data.instance_id, data.token);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp config:', error);
    }
  };

  const initializeSocket = (instanceId: string, token: string) => {
    if (socket) {
      socket.disconnect();
    }

    // Updated socket connection configuration to match Ultramsg's specification
    const newSocket = io('https://api.ultramsg.com', {
      transports: ['websocket'],
      path: `/${instanceId}/socket.io`, // This was the key change needed
      auth: {
        instance_id: instanceId,
        token: token
      }
    });

    newSocket.on('connect', () => {
      setStatus('Connected to server');
      toast.success('Connected to WhatsApp server');
    });

    newSocket.on('connect_error', (err) => {
      setStatus('Connection error');
      toast.error('Failed to connect to WhatsApp server');
      console.error('Connection error:', err);
    });

    newSocket.on('disconnect', () => {
      newSocket.disconnect();
    });

    newSocket.on('status', (results) => {
      if (results?.status?.accountStatus) {
        const { status, substatus, qrCodeImage } = results.status.accountStatus;
        
        if (status) setStatus(status);
        if (substatus) setSubstatus(substatus);
        if (qrCodeImage) {
          setQrCode(qrCodeImage);
        } else {
          setQrCode('');
        }
      }
    });

    setSocket(newSocket);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('whatsapp_instances')
        .upsert({
          user_id: user?.id,
          instance_id: instanceId,
          token: token
        });

      if (error) throw error;

      setIsConfigured(true);
      initializeSocket(instanceId, token);
      toast.success('WhatsApp configuration saved');
    } catch (error) {
      console.error('Error saving WhatsApp config:', error);
      toast.error('Failed to save WhatsApp configuration');
    }
  };

  const handleReset = async () => {
    try {
      if (socket) {
        socket.disconnect();
      }

      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setInstanceId('');
      setToken('');
      setIsConfigured(false);
      setStatus('Not connected');
      setSubstatus('');
      setQrCode('');
      toast.success('WhatsApp configuration reset');
    } catch (error) {
      console.error('Error resetting WhatsApp config:', error);
      toast.error('Failed to reset WhatsApp configuration');
    }
  };

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Link WhatsApp Account</CardTitle>
          <CardDescription>
            {isConfigured 
              ? 'Scan the QR code with your WhatsApp to connect your account'
              : 'Enter your Ultramsg instance credentials to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instanceId">Instance ID</Label>
                <Input
                  id="instanceId"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="Enter your Ultramsg instance ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Token</Label>
                <Input
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  placeholder="Enter your Ultramsg token"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Save Configuration
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
                    src={qrCode} 
                    alt="WhatsApp QR Code" 
                    className="max-w-full h-auto"
                  />
                </div>
              )}
              {!qrCode && status !== 'Connecting...' && (
                <div className="text-center p-4">
                  <p className="text-muted-foreground">QR code will appear here when ready</p>
                </div>
              )}
              <Button 
                variant="destructive" 
                onClick={handleReset}
                className="w-full"
              >
                Reset Configuration
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppLink;
