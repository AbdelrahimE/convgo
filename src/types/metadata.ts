
export type MetadataFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface MetadataField {
  id: string;
  name: string;
  description?: string | null;
  field_type: MetadataFieldType;
  is_required: boolean;
  options?: { label: string; value: string; }[] | null;
  created_at?: string;
  updated_at?: string;
  profile_id: string;
}

export interface FileMetadataValue {
  id: string;
  file_id: string;
  field_id: string;
  value: any;
  created_at?: string;
  updated_at?: string;
}

export interface MetadataFieldInput {
  id?: string;
  name: string;
  description?: string | null;
  field_type: MetadataFieldType;
  is_required: boolean;
  options?: { label: string; value: string; }[] | null;
  profile_id?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface MetadataFieldValidationState {
  name: boolean;
  description: boolean;
  options: boolean;
}

