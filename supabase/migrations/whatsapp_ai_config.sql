create table public.whatsapp_ai_config (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  whatsapp_instance_id uuid not null,
  system_prompt text not null,
  is_active boolean not null default false,
  temperature numeric not null default 1.0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  process_voice_messages boolean not null default true,
  voice_message_default_response text null default 'I''m sorry, but I cannot process voice messages at the moment. Please send your question as text, and I''ll be happy to assist you.'::text,
  default_voice_language text not null default 'ar'::text,
  use_personality_system boolean null default true,
  fallback_personality_id uuid null,
  intent_recognition_enabled boolean not null default true,
  intent_confidence_threshold numeric(3, 2) null default 0.7,
  total_personality_switches integer null default 0,
  intent_recognition_accuracy numeric(5, 4) null default 0.0,
  personality_system_metadata jsonb null default '{}'::jsonb,
  enable_data_collection boolean null default false,
  data_collection_config_id uuid null,
  constraint whatsapp_ai_config_pkey primary key (id),
  constraint whatsapp_ai_config_whatsapp_instance_id_key unique (whatsapp_instance_id),
  constraint whatsapp_ai_config_data_collection_config_id_fkey foreign KEY (data_collection_config_id) references google_sheets_config (id) on delete set null,
  constraint whatsapp_ai_config_fallback_personality_id_fkey foreign KEY (fallback_personality_id) references ai_personalities (id) on delete set null,
  constraint whatsapp_ai_config_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint whatsapp_ai_config_intent_confidence_threshold_check check (
    (
      (intent_confidence_threshold >= (0)::numeric)
      and (intent_confidence_threshold <= (1)::numeric)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_ai_config_active on public.whatsapp_ai_config using btree (whatsapp_instance_id, is_active) TABLESPACE pg_default
where
  (is_active = true);

create index IF not exists idx_whatsapp_ai_config_fallback_personality on public.whatsapp_ai_config using btree (fallback_personality_id) TABLESPACE pg_default
where
  (fallback_personality_id is not null);

create index IF not exists idx_whatsapp_ai_config_personality_system on public.whatsapp_ai_config using btree (use_personality_system) TABLESPACE pg_default
where
  (use_personality_system = true);

create trigger handle_whatsapp_ai_config_updated_at BEFORE
update on whatsapp_ai_config for EACH row
execute FUNCTION handle_updated_at ();