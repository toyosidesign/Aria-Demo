-- Aria — Supabase schema
-- Run this once in your project's SQL Editor (Supabase dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run.

-- ========================= profiles =========================
create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  name           text,
  email          text,
  context        text,
  school         text,  -- legacy, folded into context
  year           text,  -- legacy, folded into context
  avatar_url     text,
  theme          text default 'system',
  biometric_lock boolean default false,
  proactive_aria boolean default true,
  haptics        boolean default true,
  notifications  boolean default true,
  onboarded      boolean default false,
  updated_at     timestamptz default now()
);

-- ========================= tasks =========================
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  title           text not null,
  description     text,
  date            text not null,            -- ISO yyyy-MM-dd
  time            text,                     -- optional HH:mm (24h)
  priority        text not null default 'medium',
  kind            text not null default 'general',
  status          text not null default 'todo',
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  method          text,
  card_template_id text,
  photo_uri       text,
  subtasks        jsonb not null default '[]'::jsonb,
  draft_sections  jsonb not null default '[]'::jsonb,
  handled_by_aria boolean default false,
  alarm           boolean default false,
  created_at      timestamptz default now(),
  completed_at    timestamptz,
  updated_at      timestamptz default now()
);
create index if not exists tasks_user_id_idx on public.tasks (user_id);
-- Upgrade existing tables that predate these columns:
alter table public.tasks    add column if not exists alarm boolean default false;
alter table public.tasks    add column if not exists contact_phone text;
alter table public.tasks    add column if not exists card_template_id text;
alter table public.tasks    add column if not exists photo_uri text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists context text;
alter table public.profiles add column if not exists biometric_lock boolean default false;

-- ========================= contacts =========================
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  created_at timestamptz default now()
);
create index if not exists contacts_user_id_idx on public.contacts (user_id);

-- ========================= Row-Level Security =========================
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "profiles are self" on public.profiles;
create policy "profiles are self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "tasks are self" on public.tasks;
create policy "tasks are self" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "contacts are self" on public.contacts;
create policy "contacts are self" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================= auto-create a profile row on signup =========================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
