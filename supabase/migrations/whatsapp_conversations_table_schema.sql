create table public.whatsapp_conversations (
  id uuid not null default gen_random_uuid (),
  instance_id uuid not null,
  user_phone text not null,
  started_at timestamp with time zone not null default now(),
  last_activity timestamp with time zone not null default now(),
  status text not null default 'active'::text,
  conversation_data jsonb null default '{}'::jsonb,
  constraint whatsapp_conversations_pkey primary key (id),
  constraint whatsapp_conversations_instance_id_user_phone_key unique (instance_id, user_phone),
  constraint whatsapp_conversations_instance_id_fkey foreign KEY (instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint whatsapp_conversations_status_check check (
    (
      status = any (
        array['active'::text, 'inactive'::text, 'closed'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_conversations_status on public.whatsapp_conversations using btree (status) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_conversations_last_activity on public.whatsapp_conversations using btree (last_activity) TABLESPACE pg_default;