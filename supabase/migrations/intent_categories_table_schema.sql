create table public.intent_categories (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  category_key character varying(50) not null,
  display_name character varying(100) not null,
  description text null,
  keywords jsonb null default '[]'::jsonb,
  example_phrases jsonb null default '[]'::jsonb,
  classification_prompt text null,
  is_active boolean null default true,
  confidence_threshold numeric(3, 2) null default 0.6,
  is_system_category boolean null default false,
  match_count integer null default 0,
  avg_confidence numeric(3, 2) null default 0.0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint intent_categories_pkey primary key (id),
  constraint intent_categories_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_intent_categories_user on public.intent_categories using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_intent_categories_active on public.intent_categories using btree (is_active) TABLESPACE pg_default
where
  (is_active = true);

create index IF not exists idx_intent_categories_system on public.intent_categories using btree (is_system_category) TABLESPACE pg_default
where
  (is_system_category = true);

create index IF not exists idx_intent_categories_key on public.intent_categories using btree (category_key) TABLESPACE pg_default;

create index IF not exists idx_intent_categories_keywords on public.intent_categories using gin (keywords) TABLESPACE pg_default;

create unique INDEX IF not exists idx_intent_categories_unique_key on public.intent_categories using btree (user_id, category_key) TABLESPACE pg_default
where
  (is_system_category = false);

create unique INDEX IF not exists idx_intent_categories_system_unique on public.intent_categories using btree (category_key) TABLESPACE pg_default
where
  (is_system_category = true);

create trigger update_intent_categories_updated_at BEFORE
update on intent_categories for EACH row
execute FUNCTION update_intent_categories_updated_at ();