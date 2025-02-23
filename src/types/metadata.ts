
export type MetadataFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface MetadataField {
  id: string;
  name: string;
  description?: string;
  field_type: MetadataFieldType;
  is_required: boolean;
  options?: { label: string; value: string }[];
  created_at?: string;
  updated_at?: string;
}

export interface FileMetadataValue {
  id: string;
  file_id: string;
  field_id: string;
  value: any;
  created_at?: string;
  updated_at?: string;
}
