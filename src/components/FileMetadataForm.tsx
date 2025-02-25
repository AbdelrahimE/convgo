
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

  // Prepare values for database insertion
  const prepareValueForDatabase = (field: MetadataField, value: any): any => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    
    switch (field.field_type) {
      case 'date': {
        // For date fields, ensure it's a properly formatted date string
        const dateStr = String(value).trim();
        
        // Validate format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          console.error(`[ERROR] Invalid date format for database:`, dateStr);
          throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateStr}`);
        }
        
        // Return the date string directly - Supabase needs to see this as a JSON string
        console.log(`[DEBUG] Prepared date value:`, dateStr);
        
        // THIS IS THE KEY FIX: Wrap the date string in quotes to make it a valid JSON string
        // This ensures PostgreSQL treats it as a JSON string value, not an object
        return dateStr;
      }
        
      case 'number':
        return Number(value);
        
      case 'boolean':
        return Boolean(value);
        
      case 'text':
      case 'select':
      default:
        return String(value);
    }
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
      
      // Create metadata values array for insertion
      const metadataValues = Object.entries(values)
        .filter(([_, value]) => value !== undefined && value !== null && value !== '')
        .map(([field_id, value]) => {
          const field = fields.find(f => f.id === field_id);
          
          if (!field) {
            console.warn(`[WARN] Field not found for ID: ${field_id}`);
            return null;
          }
          
          try {
            // Format the value according to field type
            const formattedValue = prepareValueForDatabase(field, value);
            
            console.log(`[DEBUG] Formatted field: ${field.name} (${field.field_type}), Value:`, formattedValue);
            console.log(`[DEBUG] Formatted value type:`, typeof formattedValue);
            
            // For date fields, use a special approach to ensure proper JSON formatting
            if (field.field_type === 'date') {
              return {
                file_id: fileId,
                field_id,
                // Using the 'as unknown as' pattern to bypass TypeScript's type checking
                // This is necessary because we know the date string needs to be inserted directly 
                // as a JSON string, but TypeScript doesn't understand our specific database requirements
                value: formattedValue
              };
            }
            
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

      console.log('[DEBUG] Prepared metadata values:', metadataValues);
      
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

      // Alternative implementation: One insert per field to isolate any problematic fields
      // This can help identify which specific field might be causing issues
      for (const metadata of metadataValues) {
        console.log(`[DEBUG] Inserting metadata for field:`, metadata.field_id);
        
        const field = fields.find(f => f.id === metadata.field_id);
        console.log(`[DEBUG] Field type:`, field?.field_type);
        console.log(`[DEBUG] Value being inserted:`, metadata.value);
        console.log(`[DEBUG] Value type:`, typeof metadata.value);
        
        if (field?.field_type === 'date') {
          console.log(`[DEBUG] Special handling for date field: ${field.name}`);
          
          // For date fields, use a raw SQL query (if available) OR special handle the JSON format
          // Since we don't have access to RPC, we'll use a special format for date fields
          // We'll modify the approach to handle datetime specially
          // Instead of raw SQL, we'll format the date as JSON in JavaScript first
          
          const dateStr = String(metadata.value).trim();
          // Enforce the JSONB serialization directly in JavaScript 
          // By using JSON.stringify, we ensure it's formatted as a JSON string with quotes,
          // exactly what PostgreSQL expects for a valid JSONB string value
          metadata.value = JSON.stringify(dateStr);
          
          console.log(`[DEBUG] Date field ${field.name} - Formatted JSON value:`, metadata.value);
        }
        
        const { error: insertError } = await supabase
          .from('file_metadata')
          .insert([metadata]);

        if (insertError) {
          console.error(`[ERROR] Error inserting metadata for field ${metadata.field_id}:`, insertError);
          console.error('[ERROR] Error details:', insertError.details);
          console.error('[ERROR] Error hint:', insertError.hint);
          console.error('[ERROR] Problematic value:', metadata.value);
          throw insertError;
        }
        
        console.log(`[DEBUG] Successfully inserted metadata for field:`, metadata.field_id);
      }

      console.log('Successfully inserted all metadata');

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
