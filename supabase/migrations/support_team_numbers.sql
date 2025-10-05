create table public.support_team_numbers (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid null,
  whatsapp_number text not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  whatsapp_instance_id uuid null,
  constraint support_team_numbers_pkey primary key (id),
  constraint support_team_numbers_instance_number_unique unique (whatsapp_instance_id, whatsapp_number),
  constraint support_team_numbers_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint support_team_numbers_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_support_team_active on public.support_team_numbers using btree (user_id, is_active) TABLESPACE pg_default;

create index IF not exists idx_support_team_instance_active on public.support_team_numbers using btree (whatsapp_instance_id, is_active) TABLESPACE pg_default
where
  (is_active = true);