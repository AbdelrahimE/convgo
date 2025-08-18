create table public.whatsapp_conversation_messages (
  id uuid not null default gen_random_uuid (),
  conversation_id uuid not null,
  timestamp timestamp with time zone not null default now(),
  role text not null,
  content text not null,
  message_id text null,
  metadata jsonb null default '{}'::jsonb,
  constraint whatsapp_conversation_messages_pkey primary key (id),
  constraint whatsapp_conversation_messages_conversation_id_fkey foreign KEY (conversation_id) references whatsapp_conversations (id) on delete CASCADE,
  constraint whatsapp_conversation_messages_role_check check (
    (
      role = any (array['user'::text, 'assistant'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_conversation_messages_conversation_id on public.whatsapp_conversation_messages using btree (conversation_id) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_conversation_messages_timestamp on public.whatsapp_conversation_messages using btree ("timestamp") TABLESPACE pg_default;

create trigger trigger_update_conversation_last_activity
after INSERT on whatsapp_conversation_messages for EACH row
execute FUNCTION update_conversation_last_activity ();