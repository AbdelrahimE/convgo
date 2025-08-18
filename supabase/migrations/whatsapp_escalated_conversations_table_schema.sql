create table public.whatsapp_escalated_conversations (
  id uuid not null default gen_random_uuid (),
  whatsapp_instance_id uuid not null,
  user_phone text not null,
  escalated_at timestamp with time zone not null default now(),
  is_resolved boolean not null default false,
  resolved_at timestamp with time zone null,
  constraint whatsapp_escalated_conversations_pkey primary key (id),
  constraint whatsapp_escalated_conversati_whatsapp_instance_id_user_pho_key unique (whatsapp_instance_id, user_phone),
  constraint whatsapp_escalated_conversations_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE
) TABLESPACE pg_default;