create table public.customer_profiles (
  id uuid not null default gen_random_uuid (),
  whatsapp_instance_id uuid not null,
  phone_number text not null,
  name text null,
  email text null,
  company text null,
  customer_stage text null default 'new'::text,
  tags text[] null default '{}'::text[],
  conversation_summary text null,
  key_points jsonb null default '[]'::jsonb,
  preferences jsonb null default '{}'::jsonb,
  last_interaction timestamp with time zone null,
  first_interaction timestamp with time zone null default now(),
  total_messages integer null default 0,
  ai_interactions integer null default 0,
  customer_intent text null,
  customer_mood text null,
  urgency_level text null default 'normal'::text,
  communication_style text null,
  journey_stage text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  last_summary_update timestamp with time zone null default now(),
  action_items jsonb null default '[]'::jsonb,
  messages_since_last_summary integer null default 0,
  constraint customer_profiles_pkey primary key (id),
  constraint customer_profiles_whatsapp_instance_id_phone_number_key unique (whatsapp_instance_id, phone_number),
  constraint customer_profiles_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete CASCADE,
  constraint customer_profiles_customer_stage_check check (
    (
      customer_stage = any (
        array[
          'new'::text,
          'interested'::text,
          'customer'::text,
          'loyal'::text
        ]
      )
    )
  ),
  constraint customer_profiles_communication_style_check check (
    (
      communication_style = any (
        array[
          'formal'::text,
          'friendly'::text,
          'direct'::text,
          'detailed'::text
        ]
      )
    )
  ),
  constraint customer_profiles_urgency_level_check check (
    (
      urgency_level = any (
        array[
          'urgent'::text,
          'high'::text,
          'normal'::text,
          'low'::text
        ]
      )
    )
  ),
  constraint customer_profiles_journey_stage_check check (
    (
      journey_stage = any (
        array[
          'first_time'::text,
          'researching'::text,
          'ready_to_buy'::text,
          'existing_customer'::text
        ]
      )
    )
  ),
  constraint customer_profiles_customer_intent_check check (
    (
      customer_intent = any (
        array[
          'purchase'::text,
          'inquiry'::text,
          'support'::text,
          'complaint'::text,
          'comparison'::text
        ]
      )
    )
  ),
  constraint customer_profiles_customer_mood_check check (
    (
      customer_mood = any (
        array[
          'happy'::text,
          'frustrated'::text,
          'neutral'::text,
          'excited'::text,
          'confused'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_phone on public.customer_profiles using btree (phone_number) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_instance on public.customer_profiles using btree (whatsapp_instance_id) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_stage on public.customer_profiles using btree (customer_stage) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_last_interaction on public.customer_profiles using btree (last_interaction desc) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_instance_phone on public.customer_profiles using btree (whatsapp_instance_id, phone_number) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_intent on public.customer_profiles using btree (customer_intent) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_mood on public.customer_profiles using btree (customer_mood) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_urgency on public.customer_profiles using btree (urgency_level) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_journey on public.customer_profiles using btree (journey_stage) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_last_summary_update on public.customer_profiles using btree (last_summary_update) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_messages_since_summary on public.customer_profiles using btree (messages_since_last_summary) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_search_name on public.customer_profiles using gin (
  to_tsvector('english'::regconfig, COALESCE(name, ''::text))
) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_search_company on public.customer_profiles using gin (
  to_tsvector('english'::regconfig, COALESCE(company, ''::text))
) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_search_summary on public.customer_profiles using gin (
  to_tsvector(
    'english'::regconfig,
    COALESCE(conversation_summary, ''::text)
  )
) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_filters on public.customer_profiles using btree (
  whatsapp_instance_id,
  customer_stage,
  customer_intent,
  customer_mood,
  urgency_level,
  last_interaction desc
) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_phone_search on public.customer_profiles using gin (phone_number gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_customer_profiles_email_search on public.customer_profiles using gin (COALESCE(email, ''::text) gin_trgm_ops) TABLESPACE pg_default;

create trigger handle_customer_profiles_updated_at BEFORE
update on customer_profiles for EACH row
execute FUNCTION handle_customer_profiles_updated_at ();