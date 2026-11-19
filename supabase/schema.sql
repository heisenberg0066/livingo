-- Livingo on Supabase
-- Paste this whole file into the SQL editor of a new project, then run it once.
-- Also turn on Authentication → Sign In / Providers → Anonymous sign-ins.

create extension if not exists pgcrypto;

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  teaches text not null check (teaches in ('sv', 'fr')),
  timezone text not null,
  reminder_hour int not null default 20 check (reminder_hour between 0 and 23),
  reminder_minute int not null default 0 check (reminder_minute between 0 and 59),
  created_at timestamptz not null default now()
);

create table if not exists public.streaks (
  id uuid primary key,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  daily_limit int not null check (daily_limit between 1 and 5),
  start_date date not null,
  created_by uuid not null references public.members (id),
  created_at timestamptz not null default now()
);

create table if not exists public.words (
  id uuid primary key,
  streak_id uuid not null references public.streaks (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  author_id uuid not null references public.members (id),
  language text not null check (language in ('sv', 'fr')),
  text text not null check (char_length(text) between 1 and 80),
  meaning text not null check (char_length(meaning) between 1 and 160),
  explanation text not null default '',
  explanation_author_id uuid references public.members (id),
  local_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key,
  word_id uuid not null references public.words (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  author_id uuid not null references public.members (id),
  kind text not null check (kind in ('image', 'voice')),
  media_id text not null,
  mime_type text not null,
  duration_ms int,
  created_at timestamptz not null default now()
);

create table if not exists public.srs_states (
  id text primary key,
  word_id uuid not null references public.words (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  ease numeric not null,
  interval_days int not null,
  due date not null,
  reps int not null,
  lapses int not null,
  last_reviewed date
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  pair_id uuid not null references public.pairs (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists members_pair_idx on public.members (pair_id);
create index if not exists streaks_pair_idx on public.streaks (pair_id);
create index if not exists words_pair_idx on public.words (pair_id, local_date);
create index if not exists attachments_word_idx on public.attachments (word_id);
create index if not exists srs_member_idx on public.srs_states (member_id);

create or replace function public.livingo_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.enforce_pair_member()
returns trigger
language plpgsql
as $$
declare
  existing_count int;
  existing_lang text;
begin
  select count(*), min(teaches) into existing_count, existing_lang
  from public.members
  where pair_id = new.pair_id;
  if existing_count >= 2 then
    raise exception 'That pair already has two people.';
  end if;
  if existing_lang is not null and existing_lang = new.teaches then
    raise exception 'Your friend already teaches that language. Pick the other one.';
  end if;
  return new;
end;
$$;

drop trigger if exists members_pair_size on public.members;
create trigger members_pair_size
before insert on public.members
for each row execute function public.enforce_pair_member();

create or replace function public.my_pair_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pair_id from public.members where user_id = auth.uid()
$$;

create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid()
$$;

create or replace function public.create_pair(p_display_name text, p_teaches text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  new_pair uuid;
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in first. Turn on anonymous sign-ins.';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'This device is already in a pair. Sign out first.';
  end if;
  if p_teaches not in ('sv', 'fr') then
    raise exception 'Pick Swedish or French.';
  end if;
  if char_length(trim(p_display_name)) < 1 or char_length(trim(p_display_name)) > 24 then
    raise exception 'Add a display name.';
  end if;
  if char_length(trim(p_timezone)) < 1 then
    raise exception 'Pick a valid time zone.';
  end if;
  loop
    attempts := attempts + 1;
    new_code := public.livingo_code();
    exit when not exists (select 1 from public.pairs where code = new_code);
    if attempts > 8 then
      raise exception 'Could not mint a code. Try again.';
    end if;
  end loop;
  insert into public.pairs (code) values (new_code) returning id into new_pair;
  insert into public.members (pair_id, user_id, display_name, teaches, timezone)
  values (new_pair, auth.uid(), trim(p_display_name), p_teaches, trim(p_timezone));
end;
$$;

create or replace function public.join_pair(p_code text, p_display_name text, p_teaches text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.pairs;
begin
  if auth.uid() is null then
    raise exception 'Sign in first. Turn on anonymous sign-ins.';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'This device is already in a pair. Sign out first.';
  end if;
  if p_teaches not in ('sv', 'fr') then
    raise exception 'Pick Swedish or French.';
  end if;
  if char_length(trim(p_display_name)) < 1 or char_length(trim(p_display_name)) > 24 then
    raise exception 'Add a display name.';
  end if;
  select * into found from public.pairs where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if found.id is null then
    raise exception 'That code doesn''t match a pair.';
  end if;
  insert into public.members (pair_id, user_id, display_name, teaches, timezone)
  values (found.id, auth.uid(), trim(p_display_name), p_teaches, trim(p_timezone));
end;
$$;

revoke all on function public.create_pair(text, text, text) from public;
revoke all on function public.join_pair(text, text, text, text) from public;
grant execute on function public.create_pair(text, text, text) to authenticated;
grant execute on function public.join_pair(text, text, text, text) to authenticated;

alter table public.pairs enable row level security;
alter table public.members enable row level security;
alter table public.streaks enable row level security;
alter table public.words enable row level security;
alter table public.attachments enable row level security;
alter table public.srs_states enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "read own pair" on public.pairs;
create policy "read own pair" on public.pairs
for select to authenticated
using (id = public.my_pair_id());

drop policy if exists "read pair members" on public.members;
create policy "read pair members" on public.members
for select to authenticated
using (pair_id = public.my_pair_id() or user_id = auth.uid());

drop policy if exists "update self" on public.members;
create policy "update self" on public.members
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "pair read streaks" on public.streaks;
create policy "pair read streaks" on public.streaks
for select to authenticated using (pair_id = public.my_pair_id());
drop policy if exists "pair insert streaks" on public.streaks;
create policy "pair insert streaks" on public.streaks
for insert to authenticated with check (pair_id = public.my_pair_id() and created_by = public.my_member_id());
drop policy if exists "pair update streaks" on public.streaks;
create policy "pair update streaks" on public.streaks
for update to authenticated using (pair_id = public.my_pair_id());
drop policy if exists "pair delete streaks" on public.streaks;
create policy "pair delete streaks" on public.streaks
for delete to authenticated using (pair_id = public.my_pair_id());

drop policy if exists "pair read words" on public.words;
create policy "pair read words" on public.words
for select to authenticated using (pair_id = public.my_pair_id());
drop policy if exists "pair insert words" on public.words;
create policy "pair insert words" on public.words
for insert to authenticated with check (
  pair_id = public.my_pair_id()
  and author_id = public.my_member_id()
  and language = (select teaches from public.members where id = public.my_member_id())
);
drop policy if exists "pair update words" on public.words;
create policy "pair update words" on public.words
for update to authenticated using (pair_id = public.my_pair_id());
drop policy if exists "pair delete words" on public.words;
create policy "pair delete words" on public.words
for delete to authenticated using (pair_id = public.my_pair_id());

drop policy if exists "pair read attachments" on public.attachments;
create policy "pair read attachments" on public.attachments
for select to authenticated using (pair_id = public.my_pair_id());
drop policy if exists "pair insert attachments" on public.attachments;
create policy "pair insert attachments" on public.attachments
for insert to authenticated with check (pair_id = public.my_pair_id() and author_id = public.my_member_id());
drop policy if exists "pair delete attachments" on public.attachments;
create policy "pair delete attachments" on public.attachments
for delete to authenticated using (pair_id = public.my_pair_id());

drop policy if exists "own srs" on public.srs_states;
create policy "own srs" on public.srs_states
for all to authenticated
using (member_id = public.my_member_id() and pair_id = public.my_pair_id())
with check (member_id = public.my_member_id() and pair_id = public.my_pair_id());

drop policy if exists "own push" on public.push_subscriptions;
create policy "own push" on public.push_subscriptions
for all to authenticated
using (member_id = public.my_member_id())
with check (member_id = public.my_member_id() and pair_id = public.my_pair_id());

insert into storage.buckets (id, name, public)
values ('livingo-media', 'livingo-media', false)
on conflict (id) do nothing;

drop policy if exists "livingo read media" on storage.objects;
create policy "livingo read media" on storage.objects
for select to authenticated
using (bucket_id = 'livingo-media' and (storage.foldername(name))[1] = public.my_pair_id()::text);

drop policy if exists "livingo write media" on storage.objects;
create policy "livingo write media" on storage.objects
for insert to authenticated
with check (bucket_id = 'livingo-media' and (storage.foldername(name))[1] = public.my_pair_id()::text);

drop policy if exists "livingo delete media" on storage.objects;
create policy "livingo delete media" on storage.objects
for delete to authenticated
using (bucket_id = 'livingo-media' and (storage.foldername(name))[1] = public.my_pair_id()::text);

do $$
begin
  alter publication supabase_realtime add table public.words;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.streaks;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.attachments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.srs_states;
exception when duplicate_object then null;
end $$;
