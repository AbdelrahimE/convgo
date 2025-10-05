create table public.whatsapp_support_config (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  whatsapp_instance_id uuid not null,
  support_phone_number text not null,
  notification_message text not null default 'A customer needs support. Please check your WhatsApp Support dashboard.'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  escalation_message text not null default 'Thank you for your message. A support representative will get back to you as soon as possible.'::text,
  constraint whatsapp_support_config_pkey primary key (id),
  constraint whatsapp_support_config_whatsapp_instance_id_key unique (whatsapp_instance_id),
  constraint whatsapp_support_config_user_id_fkey foreign KEY (user_id) references profiles (id),
  constraint whatsapp_support_config_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger handle_whatsapp_support_config_updated_at BEFORE
update on whatsapp_support_config for EACH row
execute FUNCTION handle_updated_at ();