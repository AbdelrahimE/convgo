
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
    console.log("[DEBUG] FileMetadataForm mounted with fileId:", fileId);
    console.log("[DEBUG] Current user:", user);
    fetchMetadata();
  }, [fileId, user]);

  const fetchMetadata = async () => {
    if (!user || !fileId) {
      console.log("[DEBUG] Missing user or fileId:", { user, fileId });
      return;
    }

    setIsLoading(true);
    try {
      console.log("[DEBUG] Fetching metadata fields for user:", user.id);
      
      // Debug log for the query we're about to execute
      console.log("[DEBUG] Executing query: supabase.from('metadata_fields').select('*')");
      
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('metadata_fields')
        .select('*');

      console.log("[DEBUG] Raw metadata fields data:", fieldsData);
      console.log("[DEBUG] Fields query error:", fieldsError);

      if (fieldsError) {
        console.error('[ERROR] Error fetching metadata fields:', fieldsError);
        throw fieldsError;
      }

      // Check if fields data is empty
      if (!fieldsData || fieldsData.length === 0) {
        console.log("[DEBUG] No metadata fields found for user:", user.id);
      }

      // Log user profile to check if profile_id matches
      console.log("[DEBUG] User profile data:", user.user_metadata);
      
      // Try to fetch user profile to check if we have the right profile ID
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      console.log("[DEBUG] User profile from DB:", profileData);
      console.log("[DEBUG] Profile query error:", profileError);

      // Additional debugging for RLS policies
      console.log("[DEBUG] Checking metadata fields with explicit profile_id");
      
      // Try explicitly querying with the user's profile ID
      const { data: profileFieldsData, error: profileFieldsError } = await supabase
        .from('metadata_fields')
        .select('*')
        .eq('profile_id', user.id);
        
      console.log("[DEBUG] Metadata fields with profile filter:", profileFieldsData);
      console.log("[DEBUG] Profile fields query error:", profileFieldsError);

      const transformedFields: MetadataField[] = (fieldsData || []).map(field => {
        console.log("[DEBUG] Transforming field:", field);
        
        let parsedOptions;
        try {
          if (field.options) {
            if (typeof field.options === 'string') {
              parsedOptions = JSON.parse(field.options);
              console.log("[DEBUG] Parsed options from string:", parsedOptions);
            } else {
              parsedOptions = field.options;
              console.log("[DEBUG] Using options object directly:", parsedOptions);
            }
          }
        } catch (err) {
          console.error("[ERROR] Failed to parse options for field:", field.name, err);
          parsedOptions = undefined;
        }
        
        return {
          ...field,
          options: parsedOptions as { label: string; value: string }[] | undefined
        };
      });

      console.log("[DEBUG] Transformed fields:", transformedFields);
      setFields(transformedFields);

      const { data: valuesData, error: valuesError } = await supabase
        .from('file_metadata')
        .select('*')
        .eq('file_id', fileId);

      if (valuesError) {
        console.error('[ERROR] Error fetching metadata values:', valuesError);
        throw valuesError;
      }

      console.log('[DEBUG] Fetched metadata values from DB:', valuesData);
      
      const valuesObject: Record<string, any> = {};
      valuesData?.forEach((value: FileMetadataValue) => {
        valuesObject[value.field_id] = value.value;
        
        // Debug log for date fields
        const field = transformedFields.find(f => f.id === value.field_id);
        if (field?.field_type === 'date') {
          console.log(`[DEBUG] Date field from DB - Field: ${field.name}, Value:`, value.value);
          console.log(`[DEBUG] Date field type:`, typeof value.value);
          console.log(`[DEBUG] Date field JSON stringify:`, JSON.stringify(value.value));
        }
      });
      setValues(valuesObject);

      setErrors({});

    } catch (error: any) {
      console.error('[ERROR] Fetch metadata error:', error);
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
    if (!isDirty && !isSaving) {
      return null;
    }

    if (field.is_required && (value === undefined || value === null || value === '')) {
      return 'This field is required';
    }

    if (!field.is_required && (value === undefined || value === null || value === '')) {
      return null;
    }

    switch (field.field_type) {
      case 'number':
        if (isNaN(Number(value))) {
          return 'Must be a valid number';
        }
        break;
      case 'date':
        console.log(`[DEBUG] Date validation - Value:`, value);
        console.log(`[DEBUG] Date validation - Type:`, typeof value);
        console.log(`[DEBUG] Date validation - Regex test:`, /^\d{4}-\d{2}-\d{2}$/.test(value));
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

  // Updated function to properly format values based on field type, with special handling for date fields
  const formatValueForDatabase = (field: MetadataField, value: any): any => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    
    switch (field.field_type) {
      case 'text':
        return String(value);
        
      case 'number':
        return Number(value);
        
      case 'date': {
        // Ensure date value is a properly formatted string
        const dateStr = String(value).trim();
        console.log(`[DEBUG] Date format for DB - Formatted as string:`, dateStr);
        
        // Verify the format matches YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          console.error(`[ERROR] Invalid date format for database:`, dateStr);
          throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateStr}`);
        }
        
        return dateStr;
      }
        
      case 'boolean':
        return Boolean(value);
        
      case 'select':
        return String(value);
        
      default:
        return value;
    }
  };

  const handleValueChange = async (fieldId: string, value: any) => {
    setIsDirty(true);
    
    // Debug logging for date fields
    const field = fields.find(f => f.id === fieldId);
    if (field?.field_type === 'date') {
      console.log(`[DEBUG] Date onChange - Field: ${field.name}, Raw value:`, value);
      console.log(`[DEBUG] Date onChange - Type:`, typeof value);
      console.log(`[DEBUG] Date onChange - JSON stringify:`, JSON.stringify(value));
    }
    
    const newValues = {
      ...values,
      [fieldId]: value
    };
    setValues(newValues);
    
    if (field) {
      const error = await validateFormField(field, value);
      setErrors(prev => ({
        ...prev,
        [fieldId]: error || ''
      }));
    }

    console.log('Updated values:', newValues);
    console.log('Current errors:', errors);
  };

  const isFormValid = () => {
    if (!isDirty && !isSaving) {
      return true;
    }

    const requiredFields = fields.filter(field => field.is_required);
    const hasAllRequired = requiredFields.every(field => {
      const value = values[field.id];
      return value !== undefined && value !== null && value !== '';
    });
    
    const hasNoErrors = Object.values(errors).every(error => !error);
    
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

      const { error: deleteError } = await supabase
        .from('file_metadata')
        .delete()
        .eq('file_id', fileId);

      if (deleteError) {
        console.error('Error deleting existing metadata:', deleteError);
        throw deleteError;
      }

      console.log('Successfully deleted existing metadata');

      // Debug log before formatting
      console.log('[DEBUG] Raw values before formatting:', values);
      
      // Format the metadata values for database
      const metadataValues = Object.entries(values)
        .filter(([_, value]) => value !== undefined && value !== null && value !== '')
        .map(([field_id, value]) => {
          const field = fields.find(f => f.id === field_id);
          
          if (!field) {
            console.warn(`[WARN] Field not found for ID: ${field_id}`);
            return null;
          }
          
          try {
            let formattedValue = formatValueForDatabase(field, value);
            
            // Special handling for JSONB date values - this is the key fix
            // We need to ensure date values are stored as proper JSON strings
            if (field.field_type === 'date' && formattedValue !== null) {
              console.log(`[DEBUG] Date field special handling - Before:`, formattedValue);
              console.log(`[DEBUG] Date field type - Before:`, typeof formattedValue);
              
              // Explicitly convert date strings to JSONB compatible format
              // We're using a string literal rather than an object
              formattedValue = String(formattedValue);
              
              console.log(`[DEBUG] Date field special handling - After:`, formattedValue);
              console.log(`[DEBUG] Date field type - After:`, typeof formattedValue);
            }
            
            console.log(`[DEBUG] Field: ${field.name} (${field.field_type}), Final value:`, formattedValue);
            console.log(`[DEBUG] Final value type:`, typeof formattedValue);
            
            return {
              file_id: fileId,
              field_id,
              value: formattedValue
            };
          } catch (error) {
            console.error(`[ERROR] Failed to format value for field ${field.name}:`, error);
            throw error;
          }
        })
        .filter(Boolean) as any[];

      console.log('[DEBUG] Final metadata values array:', metadataValues);
      console.log('[DEBUG] Final JSON payload:', JSON.stringify(metadataValues));
      
      if (metadataValues.length === 0) {
        console.log('[INFO] No metadata values to save');
        toast({
          title: "Success",
          description: "No metadata values to save"
        });
        setIsDirty(false);
        setIsSaving(false);
        return;
      }

      // Insert the new metadata values
      const { error: insertError } = await supabase
        .from('file_metadata')
        .insert(metadataValues);

      if (insertError) {
        console.error('[ERROR] Error inserting new metadata:', insertError);
        console.error('[ERROR] Error details:', insertError.details);
        console.error('[ERROR] Error hint:', insertError.hint);
        throw insertError;
      }

      console.log('Successfully inserted new metadata');

      toast({
        title: "Success",
        description: "Metadata saved successfully"
      });

      setIsDirty(false);
      onSave?.();
      
    } catch (error: any) {
      console.error('[ERROR] Save metadata error:', error);
      console.error('[ERROR] Error message:', error.message);
      console.error('[ERROR] Error code:', error.code);
      console.error('[ERROR] Error details:', error.details);
      console.error('[ERROR] Error hint:', error.hint);
      
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
        {fields.length > 0 ? (
          fields.map(field => (
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
                <>
                  <Input
                    type="date"
                    value={values[field.id] || ''}
                    onChange={(e) => {
                      console.log(`[DEBUG] Date input onChange - Raw value:`, e.target.value);
                      console.log(`[DEBUG] Date input onChange - Type:`, typeof e.target.value);
                      handleValueChange(field.id, e.target.value);
                    }}
                    required={field.is_required}
                    className={errors[field.id] ? 'border-destructive' : ''}
                    disabled={isSaving}
                  />
                  <div className="text-xs text-muted-foreground">
                    Current value: {values[field.id] ? `"${values[field.id]}" (${typeof values[field.id]})` : 'empty'}
                  </div>
                </>
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
          ))
        ) : (
          <div>
            <p className="text-muted-foreground">No metadata fields defined</p>
            <p className="text-sm text-muted-foreground mt-2">
              Debug info: user ID = {user?.id || 'not available'}
            </p>
          </div>
        )}

        {fields.length > 0 && (
          <Button 
            onClick={handleSave} 
            disabled={!isFormValid() || isSaving}
            className="mt-4 w-full"
          >
            {isSaving ? "Saving..." : "Save Metadata"}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}
