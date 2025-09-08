import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface WhatsAppInstanceSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const WhatsAppInstanceSelector: React.FC<WhatsAppInstanceSelectorProps> = ({ value, onChange }) => {
  const { data: instances, isLoading } = useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user.id);

      if (error) throw error;
      return data as WhatsAppInstance[];
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading WhatsApp instances...
      </div>
    );
  }

  if (!instances || instances.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No WhatsApp instances found. Please add a WhatsApp number first.
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a WhatsApp number" />
      </SelectTrigger>
      <SelectContent>
        {instances.map((instance) => (
          <SelectItem key={instance.id} value={instance.id}>
            <div className="flex items-center justify-between w-full">
              <span>{instance.instance_name}</span>
              <Badge 
                variant="secondary"
                className={`ml-2 ${
                  instance.status === 'Connected' || instance.status === 'connected' 
                    ? 'bg-green-500 hover:bg-green-500 text-white px-2 py-0.5 text-xs font-medium dark:bg-green-950/50 dark:text-white'
                    : ''
                }`}
              >
                {instance.status === 'connected' ? 'Connected' : instance.status}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default WhatsAppInstanceSelector;