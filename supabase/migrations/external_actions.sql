create table public.external_actions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  whatsapp_instance_id uuid not null,
  action_name character varying(100) not null,
  display_name character varying(255) not null,
  training_examples jsonb not null default '[]'::jsonb,
  webhook_url text not null,
  http_method character varying(10) not null default 'POST'::character varying,
  headers jsonb null default '{}'::jsonb,
  payload_template jsonb not null default '{}'::jsonb,
  variable_prompts jsonb null default '{}'::jsonb,
  confidence_threshold numeric(3, 2) null default 0.75,
  is_active boolean not null default true,
  retry_attempts integer not null default 3,
  timeout_seconds integer not null default 30,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint external_actions_pkey primary key (id),
  constraint external_actions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint external_actions_whatsapp_instance_id_fkey foreign key (whatsapp_instance_id) references whatsapp_instances (id) on delete cascade,
  constraint external_actions_user_instance_name_unique unique (user_id, whatsapp_instance_id, action_name),
  constraint external_actions_http_method_check check (((http_method)::text = any (array[('GET'::character varying)::text, ('POST'::character varying)::text, ('PUT'::character varying)::text, ('PATCH'::character varying)::text]))),
  constraint external_actions_confidence_threshold_check check (((confidence_threshold >= (0.0)::numeric) and (confidence_threshold <= (1.0)::numeric))),
  constraint external_actions_retry_attempts_check check (((retry_attempts >= 0) and (retry_attempts <= 10))),
  constraint external_actions_timeout_check check (((timeout_seconds >= 1) and (timeout_seconds <= 300)))
) tablespace pg_default;

create index if not exists idx_external_actions_user_instance on public.external_actions using btree (user_id, whatsapp_instance_id) tablespace pg_default;

create index if not exists idx_external_actions_active on public.external_actions using btree (whatsapp_instance_id, is_active) tablespace pg_default where (is_active = true);

create trigger handle_external_actions_updated_at before update on external_actions for each row execute function handle_updated_at();