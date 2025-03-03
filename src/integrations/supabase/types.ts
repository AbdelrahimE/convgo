export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      document_embeddings: {
        Row: {
          chunk_id: string | null
          created_at: string | null
          embedding: string | null
          error_details: Json | null
          file_id: string
          id: string
          metadata: Json | null
          model_version: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          chunk_id?: string | null
          created_at?: string | null
          embedding?: string | null
          error_details?: Json | null
          file_id: string
          id?: string
          metadata?: Json | null
          model_version: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          chunk_id?: string | null
          created_at?: string | null
          embedding?: string | null
          error_details?: Json | null
          file_id?: string
          id?: string
          metadata?: Json | null
          model_version?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "text_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_embeddings_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_metadata: {
        Row: {
          created_at: string | null
          field_id: string
          file_id: string
          id: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          field_id: string
          file_id: string
          id?: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          field_id?: string
          file_id?: string
          id?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "file_metadata_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_metadata_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_file_metadata_field"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_file_metadata_file"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          arabic_script_details: Json | null
          created_at: string | null
          detected_languages: string[] | null
          embedding_status: Json | null
          encoding: string | null
          filename: string
          id: string
          language_confidence: Json | null
          language_detection_status: Json | null
          language_distribution: Json | null
          mime_type: string
          original_name: string
          path: string
          primary_language: string | null
          profile_id: string
          size_bytes: number
          text_content: string | null
          text_direction: string | null
          text_extraction_status: Json | null
          text_validation_status: Json | null
          updated_at: string | null
        }
        Insert: {
          arabic_script_details?: Json | null
          created_at?: string | null
          detected_languages?: string[] | null
          embedding_status?: Json | null
          encoding?: string | null
          filename: string
          id?: string
          language_confidence?: Json | null
          language_detection_status?: Json | null
          language_distribution?: Json | null
          mime_type: string
          original_name: string
          path: string
          primary_language?: string | null
          profile_id: string
          size_bytes: number
          text_content?: string | null
          text_direction?: string | null
          text_extraction_status?: Json | null
          text_validation_status?: Json | null
          updated_at?: string | null
        }
        Update: {
          arabic_script_details?: Json | null
          created_at?: string | null
          detected_languages?: string[] | null
          embedding_status?: Json | null
          encoding?: string | null
          filename?: string
          id?: string
          language_confidence?: Json | null
          language_detection_status?: Json | null
          language_distribution?: Json | null
          mime_type?: string
          original_name?: string
          path?: string
          primary_language?: string | null
          profile_id?: string
          size_bytes?: number
          text_content?: string | null
          text_direction?: string | null
          text_extraction_status?: Json | null
          text_validation_status?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_fields: {
        Row: {
          created_at: string | null
          description: string | null
          field_type: Database["public"]["Enums"]["metadata_field_type"]
          id: string
          is_required: boolean | null
          name: string
          options: Json | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          field_type: Database["public"]["Enums"]["metadata_field_type"]
          id?: string
          is_required?: boolean | null
          name: string
          options?: Json | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          field_type?: Database["public"]["Enums"]["metadata_field_type"]
          id?: string
          is_required?: boolean | null
          name?: string
          options?: Json | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metadata_fields_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_name: string | null
          created_at: string | null
          full_name: string | null
          id: string
          instance_limit: number
          is_active: boolean | null
          storage_limit_mb: number
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          instance_limit?: number
          is_active?: boolean | null
          storage_limit_mb?: number
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          instance_limit?: number
          is_active?: boolean | null
          storage_limit_mb?: number
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      text_chunks: {
        Row: {
          character_set: string | null
          chunk_order: number
          content: string
          created_at: string | null
          direction: string | null
          encoding: string | null
          file_id: string | null
          id: string
          language: string | null
          metadata: Json | null
          validation_status: Json | null
        }
        Insert: {
          character_set?: string | null
          chunk_order: number
          content: string
          created_at?: string | null
          direction?: string | null
          encoding?: string | null
          file_id?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          validation_status?: Json | null
        }
        Update: {
          character_set?: string | null
          chunk_order?: number
          content?: string
          created_at?: string | null
          direction?: string | null
          encoding?: string | null
          file_id?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          validation_status?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "text_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          last_connected: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          last_connected?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          last_connected?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      check_user_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      cleanup_failed_uploads: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_metadata: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      halfvec_avg: {
        Args: {
          "": number[]
        }
        Returns: unknown
      }
      halfvec_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      halfvec_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      has_role: {
        Args: {
          role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnswhandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      insert_date_metadata: {
        Args: {
          p_file_id: string
          p_field_id: string
          p_date_value: string
        }
        Returns: boolean
      }
      insert_default_metadata_fields: {
        Args: {
          target_profile_id: string
        }
        Returns: undefined
      }
      ivfflat_bit_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflathandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      l2_norm:
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
      l2_normalize:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      sparsevec_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      sparsevec_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      vector_avg: {
        Args: {
          "": number[]
        }
        Returns: string
      }
      vector_dims:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
      vector_norm: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      metadata_field_type: "text" | "number" | "date" | "boolean" | "select"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
