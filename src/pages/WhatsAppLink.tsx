
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const WhatsAppLink = () => {
  const [status, setStatus] = useState('Connecting...');
  const [substatus, setSubstatus] = useState('');
  const [qrCode, setQrCode] = useState('');

  useEffect(() => {
    const server = 'https://api.ultramsg.com';
    const socket = io(server, {
      transports: ['websocket'],
      path: '/socket.io',
      auth: {}
    });

    socket.on('connect', () => {
      setStatus('Connected to server');
      toast.success('Connected to WhatsApp server');
    });

    socket.on('connect_error', (err) => {
      setStatus('Connection error');
      toast.error('Failed to connect to WhatsApp server');
      console.error('Connection error:', err);
    });

    socket.on('status', (results) => {
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

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Link WhatsApp Account</CardTitle>
          <CardDescription>
            Scan the QR code with your WhatsApp to connect your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppLink;
