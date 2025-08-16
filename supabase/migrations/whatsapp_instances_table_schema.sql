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
  constraint whatsapp_instances_pkey primary key (id),
  constraint unique_instance_name unique (instance_name),
  constraint whatsapp_instances_user_id_instance_name_key unique (user_id, instance_name),
  constraint valid_instance_name check (((instance_name)::text ~ '^[a-zA-Z0-9]+$'::text))
) TABLESPACE pg_default;

create trigger handle_whatsapp_instances_updated_at BEFORE
update on whatsapp_instances for EACH row
execute FUNCTION handle_updated_at ();