create table public.ai_personalities (
  id uuid not null default gen_random_uuid (),
  whatsapp_instance_id uuid not null,
  user_id uuid not null,
  name character varying(100) not null,
  description text null,
  system_prompt text not null,
  temperature numeric(3, 2) null default 0.7,
  model character varying(50) null default 'gpt-4o-mini'::character varying,
  intent_categories jsonb null default '[]'::jsonb,
  is_active boolean null default true,
  is_default boolean null default false,
  priority integer null default 1,
  process_voice_messages boolean null default true,
  voice_message_default_response text null,
  default_voice_language character varying(10) null default 'en'::character varying,
  usage_count integer null default 0,
  is_template boolean null default false,
  template_category character varying(50) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint ai_personalities_pkey primary key (id),
  constraint ai_personalities_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE,
  constraint ai_personalities_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint ai_personalities_temperature_check check (
    (
      (temperature >= (0)::numeric)
      and (temperature <= (2)::numeric)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_ai_personalities_instance on public.ai_personalities using btree (whatsapp_instance_id) TABLESPACE pg_default;

create index IF not exists idx_ai_personalities_user on public.ai_personalities using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_ai_personalities_active on public.ai_personalities using btree (is_active) TABLESPACE pg_default
where
  (is_active = true);

create index IF not exists idx_ai_personalities_default on public.ai_personalities using btree (whatsapp_instance_id, is_default) TABLESPACE pg_default
where
  (is_default = true);

create index IF not exists idx_ai_personalities_template on public.ai_personalities using btree (is_template, template_category) TABLESPACE pg_default
where
  (is_template = true);

create index IF not exists idx_ai_personalities_intent_categories on public.ai_personalities using gin (intent_categories) TABLESPACE pg_default;

create unique INDEX IF not exists idx_ai_personalities_single_default on public.ai_personalities using btree (whatsapp_instance_id) TABLESPACE pg_default
where
  (is_default = true);

create index IF not exists idx_ai_personalities_intent_active on public.ai_personalities using btree (
  whatsapp_instance_id,
  intent_categories,
  is_active
) TABLESPACE pg_default
where
  (is_active = true);

create index IF not exists idx_ai_personalities_intent_categories_gin on public.ai_personalities using gin (intent_categories) TABLESPACE pg_default;

create trigger update_ai_personalities_updated_at BEFORE
update on ai_personalities for EACH row
execute FUNCTION update_ai_personalities_updated_at ();