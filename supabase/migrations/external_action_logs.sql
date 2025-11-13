create table public.external_action_logs (
  id uuid not null default gen_random_uuid (),
  external_action_id uuid not null,
  whatsapp_conversation_id uuid null,
  whatsapp_message_id uuid null,
  intent_confidence numeric(4, 3) null,
  extracted_variables jsonb null,
  webhook_payload jsonb null,
  webhook_response jsonb null,
  http_status_code integer null,
  execution_status character varying(20) not null,
  error_message text null,
  execution_time_ms integer null,
  retry_count integer null default 0,
  executed_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint external_action_logs_pkey primary key (id),
  constraint external_action_logs_external_action_id_fkey foreign KEY (external_action_id) references external_actions (id) on delete CASCADE,
  constraint external_action_logs_whatsapp_conversation_id_fkey foreign KEY (whatsapp_conversation_id) references whatsapp_conversations (id) on delete set null,
  constraint external_action_logs_whatsapp_message_id_fkey foreign KEY (whatsapp_message_id) references whatsapp_conversation_messages (id) on delete set null,
  constraint external_action_logs_intent_confidence_check check (
    (
      (intent_confidence >= 0.0)
      and (intent_confidence <= 1.0)
    )
  ),
  constraint external_action_logs_execution_status_check check (
    (
      (execution_status)::text = any (
        array[
          ('pending'::character varying)::text,
          ('success'::character varying)::text,
          ('failed'::character varying)::text,
          ('timeout'::character varying)::text
        ]
      )
    )
  ),
  constraint external_action_logs_retry_count_check check (
    (
      (retry_count >= 0)
      and (retry_count <= 10)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_external_action_logs_action_id on public.external_action_logs using btree (external_action_id) TABLESPACE pg_default;

create index IF not exists idx_external_action_logs_conversation on public.external_action_logs using btree (whatsapp_conversation_id) TABLESPACE pg_default;

create index IF not exists idx_external_action_logs_execution_status on public.external_action_logs using btree (execution_status, executed_at) TABLESPACE pg_default;

create index IF not exists idx_external_action_logs_executed_at on public.external_action_logs using btree (executed_at desc) TABLESPACE pg_default;