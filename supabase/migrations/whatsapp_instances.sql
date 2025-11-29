create table public.whatsapp_instances (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  instance_name character varying not null,
  status character varying not null default 'DISCONNECTED'::character varying,
  last_connected timestamp with time zone null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  reject_calls boolean not null default false,
  reject_calls_message text null default 'Sorry, I cannot take your call right now. Please leave a message and I will get back to you.'::text,
  escalation_enabled boolean null default false,
  escalation_message text null default 'تم تحويل محادثتك إلى فريق الدعم المتخصص. سيتواصل معك أحد ممثلينا قريباً. شكراً لصبرك.'::text,
  escalated_conversation_message text null default 'محادثتك قيد المراجعة من فريق الدعم. سنتواصل معك قريباً.'::text,
  escalation_keywords text[] null,
  smart_escalation_enabled boolean null default true,
  keyword_escalation_enabled boolean null default true,
  custom_escalation_enabled boolean null default false,
  custom_escalation_instructions text null,
  constraint whatsapp_instances_pkey primary key (id),
  constraint unique_instance_name unique (instance_name),
  constraint whatsapp_instances_user_id_instance_name_key unique (user_id, instance_name),
  constraint valid_instance_name check (((instance_name)::text ~ '^[a-zA-Z0-9]+$'::text))
) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_instances_custom_escalation on public.whatsapp_instances using btree (custom_escalation_enabled) TABLESPACE pg_default
where
  (custom_escalation_enabled = true);

create index IF not exists idx_whatsapp_instances_active on public.whatsapp_instances using btree (id) TABLESPACE pg_default
where
  ((status)::text = 'connected'::text);

create index IF not exists idx_whatsapp_instances_escalation_methods on public.whatsapp_instances using btree (
  smart_escalation_enabled,
  keyword_escalation_enabled
) TABLESPACE pg_default
where
  (escalation_enabled = true);

create trigger handle_whatsapp_instances_updated_at BEFORE
update on whatsapp_instances for EACH row
execute FUNCTION handle_updated_at ();