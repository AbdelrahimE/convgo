export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ai_personalities: {
        Row: {
          created_at: string | null
          default_voice_language: string | null
          description: string | null
          id: string
          intent_categories: Json | null
          is_active: boolean | null
          is_default: boolean | null
          is_template: boolean | null
          model: string | null
          name: string
          priority: number | null
          process_voice_messages: boolean | null
          system_prompt: string
          temperature: number | null
          template_category: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
          voice_message_default_response: string | null
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string | null
          default_voice_language?: string | null
          description?: string | null
          id?: string
          intent_categories?: Json | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_template?: boolean | null
          model?: string | null
          name: string
          priority?: number | null
          process_voice_messages?: boolean | null
          system_prompt: string
          temperature?: number | null
          template_category?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          voice_message_default_response?: string | null
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string | null
          default_voice_language?: string | null
          description?: string | null
          id?: string
          intent_categories?: Json | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_template?: boolean | null
          model?: string | null
          name?: string
          priority?: number | null
          process_voice_messages?: boolean | null
          system_prompt?: string
          temperature?: number | null
          template_category?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
          voice_message_default_response?: string | null
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_personalities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_personalities_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      collected_data_sessions: {
        Row: {
          collected_data: Json | null
          completed_at: string | null
          config_id: string
          conversation_id: string
          created_at: string | null
          export_error: string | null
          exported_at: string | null
          exported_to_sheets: boolean | null
          id: string
          is_complete: boolean | null
          last_message_at: string | null
          missing_fields: string[] | null
          phone_number: string
          retry_count: number | null
          sheet_row_number: number | null
          updated_at: string | null
          validation_errors: Json | null
        }
        Insert: {
          collected_data?: Json | null
          completed_at?: string | null
          config_id: string
          conversation_id: string
          created_at?: string | null
          export_error?: string | null
          exported_at?: string | null
          exported_to_sheets?: boolean | null
          id?: string
          is_complete?: boolean | null
          last_message_at?: string | null
          missing_fields?: string[] | null
          phone_number: string
          retry_count?: number | null
          sheet_row_number?: number | null
          updated_at?: string | null
          validation_errors?: Json | null
        }
        Update: {
          collected_data?: Json | null
          completed_at?: string | null
          config_id?: string
          conversation_id?: string
          created_at?: string | null
          export_error?: string | null
          exported_at?: string | null
          exported_to_sheets?: boolean | null
          id?: string
          is_complete?: boolean | null
          last_message_at?: string | null
          missing_fields?: string[] | null
          phone_number?: string
          retry_count?: number | null
          sheet_row_number?: number | null
          updated_at?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "collected_data_sessions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "google_sheets_config"
            referencedColumns: ["id"]
          },
        ]
      }
      data_collection_fields: {
        Row: {
          ask_if_missing_template: string | null
          column_letter: string | null
          config_id: string
          created_at: string | null
          extraction_keywords: string[] | null
          field_display_name: string
          field_display_name_ar: string | null
          field_name: string
          field_order: number | null
          field_type: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          prompt_template: string | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          ask_if_missing_template?: string | null
          column_letter?: string | null
          config_id: string
          created_at?: string | null
          extraction_keywords?: string[] | null
          field_display_name: string
          field_display_name_ar?: string | null
          field_name: string
          field_order?: number | null
          field_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          prompt_template?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          ask_if_missing_template?: string | null
          column_letter?: string | null
          config_id?: string
          created_at?: string | null
          extraction_keywords?: string[] | null
          field_display_name?: string
          field_display_name_ar?: string | null
          field_name?: string
          field_order?: number | null
          field_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          prompt_template?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "data_collection_fields_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "google_sheets_config"
            referencedColumns: ["id"]
          },
        ]
      }
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
      escalated_conversations: {
        Row: {
          conversation_context: Json | null
          created_at: string | null
          escalated_at: string | null
          id: string
          instance_id: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          whatsapp_number: string
        }
        Insert: {
          conversation_context?: Json | null
          created_at?: string | null
          escalated_at?: string | null
          id?: string
          instance_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          whatsapp_number: string
        }
        Update: {
          conversation_context?: Json | null
          created_at?: string | null
          escalated_at?: string | null
          id?: string
          instance_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalated_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
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
      google_sheets_config: {
        Row: {
          created_at: string | null
          google_email: string | null
          google_sheet_id: string
          google_tokens: Json | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          sheet_name: string | null
          updated_at: string | null
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          created_at?: string | null
          google_email?: string | null
          google_sheet_id: string
          google_tokens?: Json | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sheet_name?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          created_at?: string | null
          google_email?: string | null
          google_sheet_id?: string
          google_tokens?: Json | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sheet_name?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_sheets_config_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_categories: {
        Row: {
          avg_confidence: number | null
          category_key: string
          classification_prompt: string | null
          confidence_threshold: number | null
          created_at: string | null
          description: string | null
          display_name: string
          example_phrases: Json | null
          id: string
          is_active: boolean | null
          is_system_category: boolean | null
          keywords: Json | null
          match_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_confidence?: number | null
          category_key: string
          classification_prompt?: string | null
          confidence_threshold?: number | null
          created_at?: string | null
          description?: string | null
          display_name: string
          example_phrases?: Json | null
          id?: string
          is_active?: boolean | null
          is_system_category?: boolean | null
          keywords?: Json | null
          match_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_confidence?: number | null
          category_key?: string
          classification_prompt?: string | null
          confidence_threshold?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          example_phrases?: Json | null
          id?: string
          is_active?: boolean | null
          is_system_category?: boolean | null
          keywords?: Json | null
          match_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_categories_user_id_fkey"
            columns: ["user_id"]
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
          enable_smart_escalation_global: boolean | null
          full_name: string | null
          id: string
          instance_limit: number
          is_active: boolean | null
          last_prompt_generations_reset_date: string | null
          last_responses_reset_date: string | null
          monthly_ai_response_limit: number
          monthly_ai_responses_used: number
          monthly_prompt_generations_limit: number
          monthly_prompt_generations_used: number
          storage_limit_mb: number
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          enable_smart_escalation_global?: boolean | null
          full_name?: string | null
          id: string
          instance_limit?: number
          is_active?: boolean | null
          last_prompt_generations_reset_date?: string | null
          last_responses_reset_date?: string | null
          monthly_ai_response_limit?: number
          monthly_ai_responses_used?: number
          monthly_prompt_generations_limit?: number
          monthly_prompt_generations_used?: number
          storage_limit_mb?: number
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          enable_smart_escalation_global?: boolean | null
          full_name?: string | null
          id?: string
          instance_limit?: number
          is_active?: boolean | null
          last_prompt_generations_reset_date?: string | null
          last_responses_reset_date?: string | null
          monthly_ai_response_limit?: number
          monthly_ai_responses_used?: number
          monthly_prompt_generations_limit?: number
          monthly_prompt_generations_used?: number
          storage_limit_mb?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      sheets_export_logs: {
        Row: {
          config_id: string | null
          created_at: string | null
          error_message: string | null
          exported_data: Json | null
          id: string
          response_data: Json | null
          row_number: number | null
          session_id: string | null
          sheet_id: string
          status: string | null
        }
        Insert: {
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          exported_data?: Json | null
          id?: string
          response_data?: Json | null
          row_number?: number | null
          session_id?: string | null
          sheet_id: string
          status?: string | null
        }
        Update: {
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          exported_data?: Json | null
          id?: string
          response_data?: Json | null
          row_number?: number | null
          session_id?: string | null
          sheet_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sheets_export_logs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "google_sheets_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheets_export_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "collected_data_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheets_export_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "data_collection_overview"
            referencedColumns: ["session_id"]
          },
        ]
      }
      support_team_numbers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          level: string
          message: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          level?: string
          message?: string
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
          data_collection_config_id: string | null
          default_voice_language: string
          enable_data_collection: boolean | null
          fallback_personality_id: string | null
          id: string
          intent_confidence_threshold: number | null
          intent_recognition_accuracy: number | null
          intent_recognition_enabled: boolean
          is_active: boolean
          personality_system_metadata: Json | null
          process_voice_messages: boolean
          system_prompt: string
          temperature: number
          total_personality_switches: number | null
          updated_at: string
          use_personality_system: boolean | null
          user_id: string
          voice_message_default_response: string | null
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          data_collection_config_id?: string | null
          default_voice_language?: string
          enable_data_collection?: boolean | null
          fallback_personality_id?: string | null
          id?: string
          intent_confidence_threshold?: number | null
          intent_recognition_accuracy?: number | null
          intent_recognition_enabled?: boolean
          is_active?: boolean
          personality_system_metadata?: Json | null
          process_voice_messages?: boolean
          system_prompt: string
          temperature?: number
          total_personality_switches?: number | null
          updated_at?: string
          use_personality_system?: boolean | null
          user_id: string
          voice_message_default_response?: string | null
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          data_collection_config_id?: string | null
          default_voice_language?: string
          enable_data_collection?: boolean | null
          fallback_personality_id?: string | null
          id?: string
          intent_confidence_threshold?: number | null
          intent_recognition_accuracy?: number | null
          intent_recognition_enabled?: boolean
          is_active?: boolean
          personality_system_metadata?: Json | null
          process_voice_messages?: boolean
          system_prompt?: string
          temperature?: number
          total_personality_switches?: number | null
          updated_at?: string
          use_personality_system?: boolean | null
          user_id?: string
          voice_message_default_response?: string | null
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_config_data_collection_config_id_fkey"
            columns: ["data_collection_config_id"]
            isOneToOne: false
            referencedRelation: "google_sheets_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_config_fallback_personality_id_fkey"
            columns: ["fallback_personality_id"]
            isOneToOne: false
            referencedRelation: "ai_personalities"
            referencedColumns: ["id"]
          },
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
          role: string
          timestamp: string
        }
        Insert: {
          content: string
          conversation_id: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          role: string
          timestamp?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
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
          escalated_conversation_message: string | null
          escalation_enabled: boolean | null
          escalation_keywords: string[] | null
          escalation_message: string | null
          id: string
          instance_name: string
          keyword_escalation_enabled: boolean | null
          last_connected: string | null
          reject_calls: boolean
          reject_calls_message: string | null
          smart_escalation_enabled: boolean | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          escalated_conversation_message?: string | null
          escalation_enabled?: boolean | null
          escalation_keywords?: string[] | null
          escalation_message?: string | null
          id?: string
          instance_name: string
          keyword_escalation_enabled?: boolean | null
          last_connected?: string | null
          reject_calls?: boolean
          reject_calls_message?: string | null
          smart_escalation_enabled?: boolean | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          escalated_conversation_message?: string | null
          escalation_enabled?: boolean | null
          escalation_keywords?: string[] | null
          escalation_message?: string | null
          id?: string
          instance_name?: string
          keyword_escalation_enabled?: boolean | null
          last_connected?: string | null
          reject_calls?: boolean
          reject_calls_message?: string | null
          smart_escalation_enabled?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      data_collection_overview: {
        Row: {
          collected_data: Json | null
          completed_at: string | null
          conversation_id: string | null
          exported_at: string | null
          exported_to_sheets: boolean | null
          google_email: string | null
          google_sheet_id: string | null
          is_complete: boolean | null
          phone_number: string | null
          required_fields: number | null
          session_created_at: string | null
          session_id: string | null
          sheet_name: string | null
          total_fields: number | null
          user_id: string | null
          whatsapp_instance_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      check_and_update_ai_usage: {
        Args: { p_increment?: boolean; p_user_id: string }
        Returns: Json
      }
      check_personalities_for_instance: {
        Args: { p_whatsapp_instance_id: string }
        Returns: {
          active_personalities: number
          has_billing_personality: boolean
          has_general_personality: boolean
          has_sales_personality: boolean
          has_technical_personality: boolean
          intent_categories: string[]
          personality_count: number
        }[]
      }
      check_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      cleanup_failed_uploads: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_webhook_debug_logs: {
        Args: { retention_days?: number }
        Returns: undefined
      }
      detect_language_simple: {
        Args: { text_input: string }
        Returns: string
      }
      diagnose_smart_intent_system: {
        Args: { p_whatsapp_instance_id: string }
        Returns: {
          check_name: string
          details: string
          recommendation: string
          status: string
        }[]
      }
      ensure_default_personalities: {
        Args: { p_user_id: string; p_whatsapp_instance_id: string }
        Returns: boolean
      }
      escalate_conversation: {
        Args: {
          p_context?: Json
          p_instance_id: string
          p_phone_number: string
          p_reason: string
        }
        Returns: string
      }
      get_contextual_personality: {
        Args: {
          p_business_context?: Json
          p_intent: string
          p_intent_confidence?: number
          p_whatsapp_instance_id: string
        }
        Returns: {
          confidence_score: number
          personality_id: string
          personality_name: string
          system_prompt: string
          temperature: number
        }[]
      }
      get_conversation_with_context: {
        Args: {
          p_instance_id: string
          p_message_limit?: number
          p_user_phone: string
        }
        Returns: Json
      }
      get_intent_recognition_stats: {
        Args: { p_whatsapp_instance_id: string }
        Returns: {
          avg_confidence: number
          cache_hit_rate: number
          most_common_intent: string
          total_recognitions: number
        }[]
      }
      get_personality_for_intent: {
        Args: {
          p_confidence?: number
          p_intent_category: string
          p_whatsapp_instance_id: string
        }
        Returns: {
          default_voice_language: string
          model: string
          personality_id: string
          personality_name: string
          process_voice_messages: boolean
          system_prompt: string
          temperature: number
          voice_message_default_response: string
        }[]
      }
      get_personality_usage_analytics: {
        Args: { p_whatsapp_instance_id: string }
        Returns: {
          avg_confidence: number
          last_used_at: string
          most_common_intent: string
          personality_id: string
          personality_name: string
          usage_count: number
        }[]
      }
      get_user_language_preference: {
        Args: { user_id: string }
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
      is_conversation_escalated: {
        Args: { p_instance_id: string; p_phone_number: string }
        Returns: boolean
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
      match_document_chunks_by_files: {
        Args: {
          file_ids?: string[]
          filter_language?: string
          match_count: number
          match_threshold: number
          min_content_length?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          file_id: string
          id: string
          language: string
          metadata: Json
          similarity: number
        }[]
      }
      migrate_to_personality_system: {
        Args: { p_whatsapp_instance_id: string }
        Returns: string
      }
      process_message_batch: {
        Args: { p_conversation_id: string; p_timestamp_threshold: string }
        Returns: Json
      }
      reset_monthly_ai_responses: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reset_monthly_prompt_generations: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      resolve_escalation: {
        Args: {
          p_instance_id: string
          p_phone_number: string
          p_resolved_by: string
        }
        Returns: boolean
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
      store_message_with_update: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_message_id?: string
          p_role: string
        }
        Returns: Json
      }
      update_personality_usage: {
        Args: { p_personality_id: string }
        Returns: undefined
      }
      user_can_access_config: {
        Args: { config_uuid: string }
        Returns: boolean
      }
      user_can_access_instance: {
        Args: { instance_uuid: string }
        Returns: boolean
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
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
