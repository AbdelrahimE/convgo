-- Create smart escalation configuration table
create table public.smart_escalation_config (
  id uuid not null default gen_random_uuid (),
  whatsapp_instance_id uuid not null,
  user_id uuid not null,
  
  -- Smart escalation settings
  enable_smart_escalation boolean not null default true,
  escalation_sensitivity numeric(3,2) not null default 0.7, -- Escalation sensitivity 0-1
  
  -- Escalation criteria
  emotion_threshold numeric(3,2) not null default 0.8, -- Negative emotion threshold
  urgency_threshold numeric(3,2) not null default 0.7, -- Urgency threshold  
  rag_confidence_threshold numeric(3,2) not null default 0.6, -- RAG confidence threshold
  
  -- Attempt settings
  max_ai_attempts integer not null default 2, -- Maximum AI attempts before escalation
  escalation_delay_minutes integer not null default 5, -- Delay before escalation
  
  -- Custom messages
  ai_attempt_message text not null default 'دعني أحاول مساعدتك في هذا الأمر...',
  escalation_warning_message text not null default 'إذا لم تجد الإجابة مفيدة، سأقوم بتحويلك لأحد زملائي المتخصصين',
  
  -- Timestamps
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  
  -- Constraints
  constraint smart_escalation_config_pkey primary key (id),
  constraint smart_escalation_config_whatsapp_instance_id_key unique (whatsapp_instance_id),
  constraint smart_escalation_config_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade,
  constraint smart_escalation_config_whatsapp_instance_id_fkey foreign key (whatsapp_instance_id) references whatsapp_instances (id) on delete cascade,
  
  -- Check constraints for valid ranges
  constraint escalation_sensitivity_range check (escalation_sensitivity >= 0 and escalation_sensitivity <= 1),
  constraint emotion_threshold_range check (emotion_threshold >= 0 and emotion_threshold <= 1),
  constraint urgency_threshold_range check (urgency_threshold >= 0 and urgency_threshold <= 1),
  constraint rag_confidence_threshold_range check (rag_confidence_threshold >= 0 and rag_confidence_threshold <= 1),
  constraint max_ai_attempts_positive check (max_ai_attempts >= 0 and max_ai_attempts <= 10),
  constraint escalation_delay_positive check (escalation_delay_minutes >= 0 and escalation_delay_minutes <= 1440)
) tablespace pg_default;

-- Create updated_at trigger
create trigger handle_smart_escalation_config_updated_at before
update on smart_escalation_config for each row
execute function handle_updated_at ();

-- Create indexes for performance
create index if not exists idx_smart_escalation_config_instance_id on public.smart_escalation_config using btree (whatsapp_instance_id) tablespace pg_default;
create index if not exists idx_smart_escalation_config_user_id on public.smart_escalation_config using btree (user_id) tablespace pg_default;

-- Insert default configurations for existing instances
INSERT INTO smart_escalation_config (whatsapp_instance_id, user_id)
SELECT id, user_id 
FROM whatsapp_instances 
ON CONFLICT (whatsapp_instance_id) DO NOTHING;