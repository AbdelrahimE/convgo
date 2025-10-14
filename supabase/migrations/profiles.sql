create table public.profiles (
  id uuid not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  full_name text null,
  business_name text null,
  is_active boolean null default true,
  storage_limit_mb integer not null default 50,
  instance_limit integer not null default 1,
  monthly_ai_response_limit integer not null default 100,
  monthly_ai_responses_used integer not null default 0,
  last_responses_reset_date timestamp with time zone null default now(),
  monthly_prompt_generations_limit integer not null default 5,
  monthly_prompt_generations_used integer not null default 0,
  last_prompt_generations_reset_date timestamp with time zone null default now(),
  enable_smart_escalation_global boolean null default true,
  subscription_start_date timestamp with time zone null default now(),
  subscription_end_date timestamp with time zone null default (now() + '30 days'::interval),
  plan_type public.plan_type null default 'Launch'::plan_type,
  subscription_period public.subscription_period null default 'Monthly'::subscription_period,
  storage_used_mb numeric(10, 2) not null default 0,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint username_length check ((char_length(full_name) >= 3))
) TABLESPACE pg_default;

create index IF not exists idx_profiles_ai_limits on public.profiles using btree (
  monthly_ai_responses_used,
  monthly_ai_response_limit
) TABLESPACE pg_default;

create index IF not exists idx_profiles_storage_usage on public.profiles using btree (storage_used_mb, storage_limit_mb) TABLESPACE pg_default;

create index IF not exists idx_profiles_subscription_dates on public.profiles using btree (subscription_start_date, subscription_end_date) TABLESPACE pg_default;