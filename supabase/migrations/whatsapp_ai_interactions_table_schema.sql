create table public.whatsapp_ai_interactions (
  id uuid not null default gen_random_uuid (),
  whatsapp_instance_id uuid not null,
  user_message text not null,
  user_phone text not null,
  ai_response text not null,
  context_token_count integer null,
  search_result_count integer null,
  response_model text null,
  prompt_tokens integer null,
  completion_tokens integer null,
  total_tokens integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb null default '{}'::jsonb,
  constraint whatsapp_ai_interactions_pkey primary key (id),
  constraint whatsapp_ai_interactions_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_ai_interactions_metadata on public.whatsapp_ai_interactions using gin (metadata) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_ai_interactions_personality on public.whatsapp_ai_interactions using btree (((metadata ->> 'personality_id'::text))) TABLESPACE pg_default
where
  ((metadata ->> 'personality_id'::text) is not null);

create index IF not exists whatsapp_ai_interactions_instance_id_idx on public.whatsapp_ai_interactions using btree (whatsapp_instance_id) TABLESPACE pg_default;

create index IF not exists whatsapp_ai_interactions_created_at_idx on public.whatsapp_ai_interactions using btree (created_at) TABLESPACE pg_default;

create trigger handle_updated_at BEFORE
update on whatsapp_ai_interactions for EACH row
execute FUNCTION handle_updated_at ();