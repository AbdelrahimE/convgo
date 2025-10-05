-- Create ENUM types for plan and subscription period
create type public.plan_type as enum ('Launch', 'Scale', 'Growth', 'Authority');
create type public.subscription_period as enum ('monthly', 'yearly');

-- Add new columns to profiles table
alter table public.profiles
  add column plan_type public.plan_type null default 'Launch',
  add column subscription_period public.subscription_period null default 'monthly';
