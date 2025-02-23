
import { useState, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import type { MetadataField, ValidationError } from "@/types/metadata";

const VALIDATION_RULES = {
  name: {
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\s_-]+$/,
  },
  description: {
    maxLength: 500,
  },
  select: {
    minOptions: 1,
    maxOptions: 50,
  }
};

export function useMetadataValidation(profileId: string) {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const validateName = useCallback((name: string): string | null => {
    if (!name || name.length < VALIDATION_RULES.name.minLength) {
      return `Name must be at least ${VALIDATION_RULES.name.minLength} characters`;
    }
    if (name.length > VALIDATION_RULES.name.maxLength) {
      return `Name must not exceed ${VALIDATION_RULES.name.maxLength} characters`;
    }
    if (!VALIDATION_RULES.name.pattern.test(name)) {
      return 'Name can only contain letters, numbers, spaces, underscores, and hyphens';
    }
    return null;
  }, []);

  const validateDescription = useCallback((description: string | null | undefined): string | null => {
    if (!description) return null;
    if (description.length > VALIDATION_RULES.description.maxLength) {
      return `Description must not exceed ${VALIDATION_RULES.description.maxLength} characters`;
    }
    return null;
  }, []);

  const validateOptions = useCallback((options: { label: string; value: string; }[] | null | undefined): string | null => {
    if (!options) return 'Options are required for select fields';
    if (options.length < VALIDATION_RULES.select.minOptions) {
      return `At least ${VALIDATION_RULES.select.minOptions} option is required`;
    }
    if (options.length > VALIDATION_RULES.select.maxOptions) {
      return `Cannot exceed ${VALIDATION_RULES.select.maxOptions} options`;
    }

    // Check for unique values and labels
    const values = new Set(options.map(opt => opt.value));
    const labels = new Set(options.map(opt => opt.label));

    if (values.size !== options.length) {
      return 'All option values must be unique';
    }
    if (labels.size !== options.length) {
      return 'All option labels must be unique';
    }

    return null;
  }, []);

  const checkDuplicateName = useCallback(async (
    name: string, 
    currentFieldId?: string
  ): Promise<string | null> => {
    try {
      const query = supabase
        .from('metadata_fields')
        .select('id')
        .eq('profile_id', profileId)
        .eq('name', name);

      if (currentFieldId) {
        query.neq('id', currentFieldId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        return 'A field with this name already exists';
      }

      return null;
    } catch (error) {
      console.error('Error checking duplicate name:', error);
      return 'Error checking for duplicate name';
    }
  }, [profileId]);

  const validateField = useCallback(async (
    field: Partial<MetadataField>,
    options: { skipDuplicateCheck?: boolean } = {}
  ): Promise<ValidationError[]> => {
    setIsValidating(true);
    const errors: ValidationError[] = [];

    try {
      // Validate name
      if (field.name) {
        const nameError = validateName(field.name);
        if (nameError) {
          errors.push({ field: 'name', message: nameError });
        } else if (!options.skipDuplicateCheck) {
          const duplicateError = await checkDuplicateName(field.name, field.id);
          if (duplicateError) {
            errors.push({ field: 'name', message: duplicateError });
          }
        }
      }

      // Validate description
      const descError = validateDescription(field.description);
      if (descError) {
        errors.push({ field: 'description', message: descError });
      }

      // Validate select options
      if (field.field_type === 'select') {
        const optionsError = validateOptions(field.options);
        if (optionsError) {
          errors.push({ field: 'options', message: optionsError });
        }
      }

      setValidationErrors(errors);
      return errors;
    } finally {
      setIsValidating(false);
    }
  }, [validateName, validateDescription, validateOptions, checkDuplicateName]);

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
