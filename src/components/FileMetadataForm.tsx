
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
  const [isDirty, setIsDirty] = useState(false);
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
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('metadata_fields')
        .select('*');

      if (fieldsError) {
        console.error('Error fetching metadata fields:', fieldsError);
        throw fieldsError;
      }

      const transformedFields: MetadataField[] = (fieldsData || []).map(field => ({
        ...field,
        options: field.options ? (typeof field.options === 'string' ? 
          JSON.parse(field.options) : field.options) as { label: string; value: string }[]
          : undefined
      }));

      const { data: valuesData, error: valuesError } = await supabase
        .from('file_metadata')
        .select('*')
        .eq('file_id', fileId);

      if (valuesError) {
        console.error('Error fetching metadata values:', valuesError);
        throw valuesError;
      }

      setFields(transformedFields);
      
      const valuesObject: Record<string, any> = {};
      valuesData?.forEach((value: FileMetadataValue) => {
        valuesObject[value.field_id] = value.value;
      });
      setValues(valuesObject);

      // Don't set initial errors, wait for user interaction
      setErrors({});

    } catch (error: any) {
      console.error('Fetch metadata error:', error);
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
    // If not dirty and not saving, don't show validation errors yet
    if (!isDirty && !isSaving) {
      return null;
    }

    // If empty and required, return error
    if (field.is_required && (value === undefined || value === null || value === '')) {
      return 'This field is required';
    }

    // If empty but not required, it's valid
    if (!field.is_required && (value === undefined || value === null || value === '')) {
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

    return null;
  };

  const handleValueChange = async (fieldId: string, value: any) => {
    setIsDirty(true);
    const newValues = {
      ...values,
      [fieldId]: value
    };
    setValues(newValues);
    
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      const error = await validateFormField(field, value);
      setErrors(prev => ({
        ...prev,
        [fieldId]: error || ''
      }));
    }

    // Log state for debugging
    console.log('Updated values:', newValues);
    console.log('Current errors:', errors);
  };

  const isFormValid = () => {
    // If not dirty and not saving, consider form valid
    if (!isDirty && !isSaving) {
      return true;
    }

    // Check if all required fields are filled
    const requiredFields = fields.filter(field => field.is_required);
    const hasAllRequired = requiredFields.every(field => {
      const value = values[field.id];
      return value !== undefined && value !== null && value !== '';
    });
    
    // Check if there are any validation errors
    const hasNoErrors = Object.values(errors).every(error => !error);
    
    // Log validation state for debugging
    console.log('Form validation:', {
      hasAllRequired,
      hasNoErrors,
      values,
      errors
    });

    return hasAllRequired && hasNoErrors;
  };

  const handleSave = async () => {
    if (!user || !fileId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User or file information is missing"
      });
      return;
    }

    setIsSaving(true);
    console.log('Starting metadata save operation...');

    try {
      // Validate all fields before saving
      const validationErrors: Record<string, string> = {};
      for (const field of fields) {
        const error = await validateFormField(field, values[field.id]);
        if (error) {
          validationErrors[field.id] = error;
        }
      }

      setErrors(validationErrors);

      if (Object.keys(validationErrors).length > 0) {
        throw new Error('Please fill in all required fields correctly');
      }

      // Delete existing values
      const { error: deleteError } = await supabase
        .from('file_metadata')
        .delete()
        .eq('file_id', fileId);

      if (deleteError) {
        console.error('Error deleting existing metadata:', deleteError);
        throw deleteError;
      }

      console.log('Successfully deleted existing metadata');

      // Insert new values
      const metadataValues = Object.entries(values)
        .filter(([_, value]) => value !== undefined && value !== null && value !== '')
        .map(([field_id, value]) => ({
          file_id: fileId,
          field_id,
          value
        }));

      console.log('Preparing to insert new metadata:', metadataValues);

      const { error: insertError } = await supabase
        .from('file_metadata')
        .insert(metadataValues);

      if (insertError) {
        console.error('Error inserting new metadata:', insertError);
        throw insertError;
      }

      console.log('Successfully inserted new metadata');

      toast({
        title: "Success",
        description: "Metadata saved successfully"
      });

      // Reset form state and call onSave callback
      setIsDirty(false);
      onSave?.();
      
    } catch (error: any) {
      console.error('Save metadata error:', error);
      toast({
        variant: "destructive",
        title: "Error saving metadata",
        description: error.message || "Failed to save metadata. Please try again."
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
                onChange={(e) => handleValueChange(field.id, e.target.value)}
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
            disabled={!isFormValid() || isSaving}
            className="mt-4 w-full"
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

