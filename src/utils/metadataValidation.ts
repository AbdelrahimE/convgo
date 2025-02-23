
export const VALIDATION_RULES = {
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

export interface ValidationError {
  field: string;
  message: string;
}

export function validateFieldName(name: string): ValidationError | null {
  if (!name || name.length < VALIDATION_RULES.name.minLength) {
    return {
      field: 'name',
      message: `Name must be at least ${VALIDATION_RULES.name.minLength} characters`
    };
  }

  if (name.length > VALIDATION_RULES.name.maxLength) {
    return {
      field: 'name',
      message: `Name must not exceed ${VALIDATION_RULES.name.maxLength} characters`
    };
  }

  if (!VALIDATION_RULES.name.pattern.test(name)) {
    return {
      field: 'name',
      message: 'Name can only contain letters, numbers, spaces, underscores, and hyphens'
    };
  }

  return null;
}

export function validateDescription(description: string | null | undefined): ValidationError | null {
  if (!description) return null;

  if (description.length > VALIDATION_RULES.description.maxLength) {
    return {
      field: 'description',
      message: `Description must not exceed ${VALIDATION_RULES.description.maxLength} characters`
    };
  }

  return null;
}

export function validateSelectOptions(options: { label: string; value: string; }[] | null | undefined): ValidationError | null {
  if (!options || options.length < VALIDATION_RULES.select.minOptions) {
    return {
      field: 'options',
      message: `Select field must have at least ${VALIDATION_RULES.select.minOptions} option`
    };
  }

  if (options.length > VALIDATION_RULES.select.maxOptions) {
    return {
      field: 'options',
      message: `Select field cannot exceed ${VALIDATION_RULES.select.maxOptions} options`
    };
  }

  // Check for unique values
  const values = new Set(options.map(opt => opt.value));
  if (values.size !== options.length) {
    return {
      field: 'options',
      message: 'All option values must be unique'
    };
  }

  // Check for unique labels
  const labels = new Set(options.map(opt => opt.label));
  if (labels.size !== options.length) {
    return {
      field: 'options',
      message: 'All option labels must be unique'
    };
  }

  return null;
}

export async function checkDuplicateName(
  name: string, 
  profileId: string, 
  currentFieldId: string | undefined,
  supabase: any
): Promise<ValidationError | null> {
  const query = supabase
    .from('metadata_fields')
    .select('id')
    .eq('profile_id', profileId)
    .eq('name', name);

  if (currentFieldId) {
    query.neq('id', currentFieldId);
  }

  const { data, error } = await query;

  if (error) {
    return {
      field: 'name',
      message: 'Error checking for duplicate name'
    };
  }

  if (data && data.length > 0) {
    return {
      field: 'name',
      message: 'A field with this name already exists'
    };
  }

  return null;
}

export function validateMetadataField(field: {
  name: string;
  description?: string | null;
  field_type: string;
  options?: { label: string; value: string; }[] | null;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate name
  const nameError = validateFieldName(field.name);
  if (nameError) errors.push(nameError);

  // Validate description
  const descriptionError = validateDescription(field.description);
  if (descriptionError) errors.push(descriptionError);

  // Validate select options
  if (field.field_type === 'select') {
    const optionsError = validateSelectOptions(field.options);
    if (optionsError) errors.push(optionsError);
  }

  return errors;
}
