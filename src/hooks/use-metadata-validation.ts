
import { useState, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { ValidationError, validateMetadataField, checkDuplicateName } from '@/utils/metadataValidation';
import type { MetadataField } from '@/types/metadata';

export function useMetadataValidation(profileId: string) {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const validateField = useCallback(async (
    field: Partial<MetadataField>,
    skipDuplicateCheck: boolean = false
  ): Promise<ValidationError[]> => {
    setIsValidating(true);
    
    try {
      // Run synchronous validations
      const errors = validateMetadataField(field as any);

      // Check for duplicate names if needed
      if (!skipDuplicateCheck && field.name) {
        const duplicateError = await checkDuplicateName(
          field.name,
          profileId,
          field.id,
          supabase
        );
        
        if (duplicateError) {
          errors.push(duplicateError);
        }
      }

      setValidationErrors(errors);
      return errors;
    } finally {
      setIsValidating(false);
    }
  }, [profileId]);

  const clearValidation = useCallback(() => {
    setValidationErrors([]);
  }, []);

  const getFieldError = useCallback((fieldName: string): string | undefined => {
    const error = validationErrors.find(err => err.field === fieldName);
    return error?.message;
  }, [validationErrors]);

  return {
    validationErrors,
    isValidating,
    validateField,
    clearValidation,
    getFieldError
  };
}
