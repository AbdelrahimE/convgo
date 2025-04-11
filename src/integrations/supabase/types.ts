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
          business_name: string | null
          created_at: string | null
          full_name: string | null
          id: string
          instance_limit: number
          is_active: boolean | null
          last_responses_reset_date: string | null
          monthly_ai_response_limit: number
          monthly_ai_responses_used: number
          storage_limit_mb: number
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          instance_limit?: number
          is_active?: boolean | null
          last_responses_reset_date?: string | null
          monthly_ai_response_limit?: number
          monthly_ai_responses_used?: number
          storage_limit_mb?: number
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          instance_limit?: number
          is_active?: boolean | null
          last_responses_reset_date?: string | null
          monthly_ai_response_limit?: number
          monthly_ai_responses_used?: number
          storage_limit_mb?: number
          updated_at?: string | null
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
      webhook_debug_logs: {
        Row: {
          category: string
          created_at: string
          data: Json | null
          id: string
          message: string
        }
        Insert: {
          category: string
          created_at?: string
          data?: Json | null
          id?: string
          message: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
        }
        Relationships: []
      }
      webhook_messages: {
        Row: {
          data: Json
          event: string
          id: string
          instance: string
          received_at: string
        }
        Insert: {
          data: Json
          event: string
          id?: string
          instance: string
          received_at?: string
        }
        Update: {
          data?: Json
          event?: string
          id?: string
          instance?: string
          received_at?: string
        }
        Relationships: []
      }
      whatsapp_ai_config: {
        Row: {
          created_at: string
          default_voice_language: string
          id: string
          is_active: boolean
          process_voice_messages: boolean
          system_prompt: string
          temperature: number
          updated_at: string
          user_id: string
          voice_message_default_response: string | null
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          default_voice_language?: string
          id?: string
          is_active?: boolean
          process_voice_messages?: boolean
          system_prompt: string
          temperature?: number
          updated_at?: string
          user_id: string
          voice_message_default_response?: string | null
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          default_voice_language?: string
          id?: string
          is_active?: boolean
          process_voice_messages?: boolean
          system_prompt?: string
          temperature?: number
          updated_at?: string
          user_id?: string
          voice_message_default_response?: string | null
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_config_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_interactions: {
        Row: {
          ai_response: string
          completion_tokens: number | null
          context_token_count: number | null
          created_at: string
          id: string
          prompt_tokens: number | null
          response_model: string | null
          search_result_count: number | null
          total_tokens: number | null
          updated_at: string
          user_message: string
          user_phone: string
          whatsapp_instance_id: string
        }
        Insert: {
          ai_response: string
          completion_tokens?: number | null
          context_token_count?: number | null
          created_at?: string
          id?: string
          prompt_tokens?: number | null
          response_model?: string | null
          search_result_count?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_message: string
          user_phone: string
          whatsapp_instance_id: string
        }
        Update: {
          ai_response?: string
          completion_tokens?: number | null
          context_token_count?: number | null
          created_at?: string
          id?: string
          prompt_tokens?: number | null
          response_model?: string | null
          search_result_count?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_message?: string
          user_phone?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_interactions_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          id: string
          message_id: string | null
          metadata: Json | null
          processed: boolean | null
          role: string
          timestamp: string
        }
        Insert: {
          content: string
          conversation_id: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          processed?: boolean | null
          role: string
          timestamp?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          processed?: boolean | null
          role?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          conversation_data: Json | null
          id: string
          instance_id: string
          last_activity: string
          started_at: string
          status: string
          user_phone: string
        }
        Insert: {
          conversation_data?: Json | null
          id?: string
          instance_id: string
          last_activity?: string
          started_at?: string
          status?: string
          user_phone: string
        }
        Update: {
          conversation_data?: Json | null
          id?: string
          instance_id?: string
          last_activity?: string
          started_at?: string
          status?: string
          user_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_escalated_conversations: {
        Row: {
          escalated_at: string
          id: string
          is_resolved: boolean
          resolved_at: string | null
          user_phone: string
          whatsapp_instance_id: string
        }
        Insert: {
          escalated_at?: string
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          user_phone: string
          whatsapp_instance_id: string
        }
        Update: {
          escalated_at?: string
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          user_phone?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_escalated_conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_file_mappings: {
        Row: {
          created_at: string
          file_id: string
          id: string
          updated_at: string
          user_id: string
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          updated_at?: string
          user_id: string
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          updated_at?: string
          user_id?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_file_mappings_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_file_mappings_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
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
      whatsapp_support_config: {
        Row: {
          created_at: string
          escalation_message: string
          id: string
          notification_message: string
          support_phone_number: string
          updated_at: string
          user_id: string
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          escalation_message?: string
          id?: string
          notification_message?: string
          support_phone_number: string
          updated_at?: string
          user_id: string
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          escalation_message?: string
          id?: string
          notification_message?: string
          support_phone_number?: string
          updated_at?: string
          user_id?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_support_config_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_support_config_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_support_keywords: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_whatsapp_support_keywords_instance"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_support_keywords_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
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
      detect_language_simple: {
        Args: { text_input: string }
        Returns: string
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_role: {
        Args: { role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      insert_date_metadata: {
        Args: { p_file_id: string; p_field_id: string; p_date_value: string }
        Returns: boolean
      }
      insert_default_metadata_fields: {
        Args: { target_profile_id: string }
        Returns: undefined
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      match_document_chunks: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
          min_content_length?: number
          filter_language?: string
        }
        Returns: {
          id: string
          chunk_id: string
          file_id: string
          content: string
          metadata: Json
          similarity: number
          language: string
        }[]
      }
      match_document_chunks_by_files: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
          min_content_length?: number
          filter_language?: string
          file_ids?: string[]
        }
        Returns: {
          id: string
          chunk_id: string
          file_id: string
          content: string
          metadata: Json
          similarity: number
          language: string
        }[]
      }
      reset_monthly_ai_responses: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      metadata_field_type: ["text", "number", "date", "boolean", "select"],
    },
  },
} as const
