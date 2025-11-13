create table public.external_action_responses (
  id uuid not null default gen_random_uuid (),
  execution_log_id uuid not null,
  conversation_id uuid not null,
  user_phone character varying(20) not null,
  instance_name character varying(100) not null,
  response_received boolean null default false,
  response_message text null,
  response_data jsonb null,
  received_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  expires_at timestamp with time zone not null,
  constraint external_action_responses_pkey primary key (id),
  constraint external_action_responses_execution_log_id_fkey foreign KEY (execution_log_id) references external_action_logs (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_pending_responses on public.external_action_responses using btree (execution_log_id, response_received) TABLESPACE pg_default;

create index IF not exists idx_expired_responses on public.external_action_responses using btree (expires_at) TABLESPACE pg_default
where
  (response_received = false);

create index IF not exists idx_external_action_responses_execution_log on public.external_action_responses using btree (execution_log_id) TABLESPACE pg_default
where
  (response_received = false);