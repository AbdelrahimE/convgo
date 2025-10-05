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
        .eq('user_id', user.id)
        .eq('status', 'Connected');

      if (error) throw error;
      return data as WhatsAppInstance[];
    }
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || !instances || instances.length === 0}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select WhatsApp number" />
      </SelectTrigger>
      <SelectContent>
        {instances && instances.length === 0 ? (
          <SelectItem value="none">
            No connected numbers
          </SelectItem>
        ) : (
          instances?.map((instance) => (
            <SelectItem key={instance.id} value={instance.id}>
              <div className="flex items-center justify-between w-full gap-x-2">
                <span>{instance.instance_name}</span>
                <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                  Connected
                </span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};

export default WhatsAppInstanceSelector;