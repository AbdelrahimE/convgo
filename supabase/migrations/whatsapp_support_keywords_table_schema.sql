create table public.whatsapp_support_keywords (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  keyword text not null,
  category text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  whatsapp_instance_id uuid null,
  constraint whatsapp_support_keywords_pkey primary key (id),
  constraint whatsapp_support_keywords_user_id_keyword_key unique (user_id, keyword),
  constraint fk_whatsapp_support_keywords_instance foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint whatsapp_support_keywords_user_id_fkey foreign KEY (user_id) references profiles (id)
) TABLESPACE pg_default;

create index IF not exists idx_whatsapp_support_keywords_instance_id on public.whatsapp_support_keywords using btree (whatsapp_instance_id) TABLESPACE pg_default;