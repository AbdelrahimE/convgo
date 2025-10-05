create table public.escalated_conversations (
  id uuid not null default extensions.uuid_generate_v4 (),
  whatsapp_number text not null,
  instance_id uuid null,
  escalated_at timestamp with time zone null default now(),
  reason text null,
  conversation_context jsonb null default '[]'::jsonb,
  resolved_at timestamp with time zone null,
  resolved_by uuid null,
  created_at timestamp with time zone null default now(),
  constraint escalated_conversations_pkey primary key (id),
  constraint unique_active_escalation unique (whatsapp_number, instance_id, resolved_at),
  constraint escalated_conversations_instance_id_fkey foreign KEY (instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint escalated_conversations_resolved_by_fkey foreign KEY (resolved_by) references auth.users (id),
  constraint escalated_conversations_reason_check check (
    (
      (
        reason = any (
          array['user_request'::text, 'ai_detected_intent'::text]
        )
      )
      or (reason is null)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_escalated_conversations_instance on public.escalated_conversations using btree (instance_id) TABLESPACE pg_default;

create index IF not exists idx_escalated_conversations_status on public.escalated_conversations using btree (resolved_at) TABLESPACE pg_default;

create index IF not exists idx_escalated_conversations_number on public.escalated_conversations using btree (whatsapp_number) TABLESPACE pg_default;

create index IF not exists idx_escalated_active on public.escalated_conversations using btree (instance_id, whatsapp_number, resolved_at) TABLESPACE pg_default
where
  (resolved_at is null);