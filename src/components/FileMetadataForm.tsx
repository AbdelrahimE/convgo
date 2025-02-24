
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
import { Skeleton } from "@/components/ui/skeleton";
import { useMetadataValidation } from "@/hooks/use-metadata-validation";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MetadataField, FileMetadataValue } from "@/types/metadata";

interface FileMetadataFormProps {
  fileId: string;
  onSave?: () => void;
}

export function FileMetadataForm({ fileId, onSave }: FileMetadataFormProps) {
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { validateField } = useMetadataValidation(user?.id || '');

  useEffect(() => {
    fetchMetadata();
  }, [fileId, user]);

  const fetchMetadata = async () => {
    if (!user || !fileId) return;

    setIsLoading(true);
    try {
      // Fetch metadata fields
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('metadata_fields')
        .select('*');

      if (fieldsError) throw fieldsError;

      // Transform fields data to ensure options are properly parsed
      const transformedFields: MetadataField[] = (fieldsData || []).map(field => ({
        ...field,
        options: field.options ? (typeof field.options === 'string' ? 
          JSON.parse(field.options) : field.options) as { label: string; value: string }[]
          : undefined
      }));

      // Fetch existing values
      const { data: valuesData, error: valuesError } = await supabase
        .from('file_metadata')
        .select('*')
        .eq('file_id', fileId);

      if (valuesError) throw valuesError;

      setFields(transformedFields);
      
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

  const validateFormField = async (field: MetadataField, value: any): Promise<string | null> => {
    // Basic required field validation
    if (field.is_required && (value === undefined || value === null || value === '')) {
      return 'This field is required';
    }

    // If empty but not required, it's valid
    if (value === undefined || value === null || value === '') {
      return null;
    }

    // Type-specific validation
    switch (field.field_type) {
      case 'number':
        if (isNaN(Number(value))) {
          return 'Must be a valid number';
        }
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return 'Must be a valid date (YYYY-MM-DD)';
        }
        break;
      case 'select':
        if (field.options && !field.options.some(opt => opt.value === value)) {
          return 'Invalid selection';
        }
        break;
    }

    // Use metadata validation for additional checks
    const validationErrors = await validateField({
      ...field,
      name: field.name,
      description: field.description,
      options: field.options,
    });

    const error = validationErrors.find(err => err.field === 'name' || err.field === 'description' || err.field === 'options');
    return error ? error.message : null;
  };

  const handleValueChange = async (fieldId: string, value: any) => {
    setValues(prev => ({
      ...prev,
      [fieldId]: value
    }));
    
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      const error = await validateFormField(field, value);
      setErrors(prev => ({
        ...prev,
        [fieldId]: error || ''
      }));
    }
  };

  const handleSave = async () => {
    if (!user || !fileId) return;

    // Validate all fields
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    for (const field of fields) {
      const error = await validateFormField(field, values[field.id]);
      if (error) {
        newErrors[field.id] = error;
        hasErrors = true;
      }
    }

    if (hasErrors) {
      setErrors(newErrors);
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please check the form for errors"
      });
      return;
    }

    setIsSaving(true);
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
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[60vh] pr-4">
      <div className="space-y-4 animate-in fade-in duration-300">
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
                className={errors[field.id] ? 'border-destructive' : ''}
                disabled={isSaving}
              />
            )}
            
            {field.field_type === 'number' && (
              <Input
                type="number"
                value={values[field.id] || ''}
                onChange={(e) => handleValueChange(field.id, parseFloat(e.target.value))}
                required={field.is_required}
                className={errors[field.id] ? 'border-destructive' : ''}
                disabled={isSaving}
              />
            )}
            
            {field.field_type === 'date' && (
              <Input
                type="date"
                value={values[field.id] || ''}
                onChange={(e) => handleValueChange(field.id, e.target.value)}
                required={field.is_required}
                className={errors[field.id] ? 'border-destructive' : ''}
                disabled={isSaving}
              />
            )}
            
            {field.field_type === 'boolean' && (
              <Switch
                checked={values[field.id] || false}
                onCheckedChange={(checked) => handleValueChange(field.id, checked)}
                disabled={isSaving}
              />
            )}
            
            {field.field_type === 'select' && field.options && (
              <Select
                value={values[field.id] || ''}
                onValueChange={(value) => handleValueChange(field.id, value)}
                disabled={isSaving}
              >
                <SelectTrigger className={errors[field.id] ? 'border-destructive' : ''}>
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
            
            {errors[field.id] && (
              <p className="text-sm text-destructive">{errors[field.id]}</p>
            )}
          </div>
        ))}

        {fields.length > 0 && (
          <Button 
            onClick={handleSave} 
            disabled={isSaving || Object.keys(errors).length > 0}
            className="mt-4"
          >
            {isSaving ? "Saving..." : "Save Metadata"}
          </Button>
        )}

        {fields.length === 0 && (
          <p className="text-muted-foreground">No metadata fields defined</p>
        )}
      </div>
    </ScrollArea>
  );
}
