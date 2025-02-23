
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MetadataField, FileMetadataValue } from "@/types/metadata";

interface FileMetadataFormProps {
  fileId: string;
  onSave?: () => void;
}

export function FileMetadataForm({ fileId, onSave }: FileMetadataFormProps) {
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchMetadata();
  }, [fileId, user]);

  const fetchMetadata = async () => {
    if (!user || !fileId) return;

    try {
      // Fetch metadata fields
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('metadata_fields')
        .select('*');

      if (fieldsError) throw fieldsError;

      // Fetch existing values
      const { data: valuesData, error: valuesError } = await supabase
        .from('file_metadata')
        .select('*')
        .eq('file_id', fileId);

      if (valuesError) throw valuesError;

      setFields(fieldsData || []);
      
      // Transform values array to object
      const valuesObject: Record<string, any> = {};
      valuesData?.forEach((value: FileMetadataValue) => {
        valuesObject[value.field_id] = value.value;
      });
      setValues(valuesObject);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error fetching metadata",
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !fileId) return;

    try {
      // Delete existing values
      await supabase
        .from('file_metadata')
        .delete()
        .eq('file_id', fileId);

      // Insert new values
      const metadataValues = Object.entries(values).map(([field_id, value]) => ({
        file_id: fileId,
        field_id,
        value
      }));

      const { error } = await supabase
        .from('file_metadata')
        .insert(metadataValues);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Metadata saved successfully"
      });

      onSave?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error saving metadata",
        description: error.message
      });
    }
  };

  const handleValueChange = (fieldId: string, value: any) => {
    setValues(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  if (isLoading) {
    return <div>Loading metadata...</div>;
  }

  return (
    <div className="space-y-4">
      {fields.map(field => (
        <div key={field.id} className="space-y-2">
          <Label>
            {field.name}
            {field.is_required && <span className="text-destructive ml-1">*</span>}
          </Label>
          
          {field.field_type === 'text' && (
            <Input
              value={values[field.id] || ''}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              required={field.is_required}
            />
          )}
          
          {field.field_type === 'number' && (
            <Input
              type="number"
              value={values[field.id] || ''}
              onChange={(e) => handleValueChange(field.id, parseFloat(e.target.value))}
              required={field.is_required}
            />
          )}
          
          {field.field_type === 'date' && (
            <Input
              type="date"
              value={values[field.id] || ''}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              required={field.is_required}
            />
          )}
          
          {field.field_type === 'boolean' && (
            <Switch
              checked={values[field.id] || false}
              onCheckedChange={(checked) => handleValueChange(field.id, checked)}
            />
          )}
          
          {field.field_type === 'select' && field.options && (
            <Select
              value={values[field.id] || ''}
              onValueChange={(value) => handleValueChange(field.id, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      ))}

      {fields.length > 0 && (
        <Button onClick={handleSave}>Save Metadata</Button>
      )}

      {fields.length === 0 && (
        <p className="text-muted-foreground">No metadata fields defined</p>
      )}
    </div>
  );
}
