-- Livingo schema. Safe to run more than once.
-- Dashboard (do these before or after this script):
--   1. Authentication → Sign In / Providers → Anonymous sign-ins: ON.
--   2. SQL editor → paste this whole file → Run.
--   3. Storage should show a private bucket named livingo-media. This script creates it.
--   4. Database → Publications → supabase_realtime should include words, streaks,
--      attachments, members, and srs_states. This script adds them.
-- This project can hold one pair, ever, and that pair can hold two members.
-- A second pair, or a third member, is rejected in the database.
-- Do not put the service-role key in the app. The publishable key is enough.

create extension if not exists pgcrypto;

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

-- One row, forever. Stays even if the pair row is removed, so a second pair cannot be created.
create table if not exists public.pair_lock (
  id int primary key check (id = 1),
  pair_id uuid,
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

create or replace function public.enforce_one_pair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.pair_lock) then
    raise exception 'This Livingo is private.';
  end if;
  insert into public.pair_lock (id, pair_id) values (1, new.id);
  return new;
end;
$$;

create or replace function public.enforce_pair_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
  existing_lang text;
begin
  if (select count(*) from public.members) >= 2 then
    raise exception 'This Livingo is private.';
  end if;
  select count(*), min(teaches) into existing_count, existing_lang
  from public.members
  where pair_id = new.pair_id;
  if existing_count >= 2 then
    raise exception 'This Livingo is private.';
  end if;
  if existing_lang is not null and existing_lang = new.teaches then
    raise exception 'Your friend already teaches that language. Pick the other one.';
  end if;
  return new;
end;
$$;

drop trigger if exists pairs_only_one on public.pairs;
create trigger pairs_only_one
before insert on public.pairs
for each row execute function public.enforce_one_pair();

drop trigger if exists members_pair_size on public.members;
create trigger members_pair_size
before insert on public.members
for each row execute function public.enforce_pair_member();

-- If this script is re-run after a pair already exists, seal the lock.
insert into public.pair_lock (id, pair_id)
select 1, id from public.pairs
order by created_at
limit 1
on conflict (id) do nothing;

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
  if exists (select 1 from public.pair_lock) or exists (select 1 from public.pairs) then
    raise exception 'This Livingo is private.';
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
  v_pair public.pairs;
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
  if (select count(*) from public.members) >= 2 then
    raise exception 'This Livingo is private.';
  end if;
  select * into v_pair from public.pairs where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    raise exception 'That code doesn''t match a pair.';
  end if;
  insert into public.members (pair_id, user_id, display_name, teaches, timezone)
  values (v_pair.id, auth.uid(), trim(p_display_name), p_teaches, trim(p_timezone));
end;
$$;

revoke all on function public.create_pair(text, text, text) from public, anon;
revoke all on function public.join_pair(text, text, text, text) from public, anon;
grant execute on function public.create_pair(text, text, text) to authenticated;
grant execute on function public.join_pair(text, text, text, text) to authenticated;
grant execute on function public.my_pair_id() to authenticated;
grant execute on function public.my_member_id() to authenticated;
revoke all on function public.enforce_one_pair() from public, anon, authenticated;
revoke all on function public.enforce_pair_member() from public, anon, authenticated;
revoke all on function public.livingo_code() from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
revoke all on
  public.pairs,
  public.pair_lock,
  public.members,
  public.streaks,
  public.words,
  public.attachments,
  public.srs_states,
  public.push_subscriptions
from anon, authenticated;
grant select, insert, update, delete on
  public.pairs,
  public.members,
  public.streaks,
  public.words,
  public.attachments,
  public.srs_states,
  public.push_subscriptions
to authenticated;

alter table public.pairs enable row level security;
alter table public.pair_lock enable row level security;
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

insert into storage.buckets (id, name, public, file_size_limit)
values ('livingo-media', 'livingo-media', false, 8388608)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

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

alter table public.streaks add column if not exists starter_id uuid references public.members (id);
alter table public.words add column if not exists reply_text text not null default '';
alter table public.words add column if not exists reply_language text;
alter table public.words add column if not exists reply_author_id uuid references public.members (id);
alter table public.words add column if not exists replied_at timestamptz;

update public.streaks s
set starter_id = coalesce(
  (
    select case
      when mod((w.local_date - s.start_date), 2) = 0 then w.author_id
      else (
        select m.id from public.members m
        where m.pair_id = s.pair_id and m.id <> w.author_id
        limit 1
      )
    end
    from public.words w
    where w.streak_id = s.id
    order by w.local_date, w.created_at
    limit 1
  ),
  s.created_by
)
where s.starter_id is null;

alter table public.streaks alter column starter_id set not null;

create or replace function public.enforce_word_turn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_streak public.streaks;
  v_poster uuid;
  v_replier uuid;
  v_other uuid;
  v_offset int;
  v_poster_today date;
  v_replier_today date;
  v_count int;
begin
  select * into v_streak from public.streaks where id = new.streak_id;
  if not found then
    raise exception 'That streak is not on this pair.';
  end if;
  select id into v_other from public.members
  where pair_id = v_streak.pair_id and id <> v_streak.starter_id
  limit 1;
  v_offset := new.local_date - v_streak.start_date;
  if v_offset < 0 then
    raise exception 'That day is before this streak started.';
  end if;
  if mod(v_offset, 2) = 0 then
    v_poster := v_streak.starter_id;
    v_replier := v_other;
  else
    v_poster := v_other;
    v_replier := v_streak.starter_id;
  end if;
  v_poster_today := (now() at time zone (select timezone from public.members where id = v_poster))::date;
  v_replier_today := (now() at time zone (select timezone from public.members where id = v_replier))::date;

  if tg_op = 'INSERT' then
    if new.author_id <> v_poster then
      raise exception 'It is not your turn to post.';
    end if;
    if new.local_date <> v_poster_today then
      raise exception 'You can only post on today in your time zone.';
    end if;
    if coalesce(new.reply_text, '') <> '' then
      raise exception 'Add the translation as a reply.';
    end if;
    select count(*) into v_count from public.words
    where streak_id = new.streak_id and local_date = new.local_date;
    if v_count >= v_streak.daily_limit then
      raise exception 'Today''s words are already posted.';
    end if;
    new.reply_text := '';
    return new;
  end if;

  if coalesce(old.reply_text, '') = '' and coalesce(new.reply_text, '') <> '' then
    if new.reply_author_id is distinct from v_replier then
      raise exception 'Only the other person can reply.';
    end if;
    if v_replier_today > new.local_date + 1 then
      raise exception 'The reply window for that day has closed.';
    end if;
    new.reply_language := (select teaches from public.members where id = v_replier);
    if new.replied_at is null then
      new.replied_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists words_turn on public.words;
create trigger words_turn
before insert or update on public.words
for each row execute function public.enforce_word_turn();

revoke all on function public.enforce_word_turn() from public, anon, authenticated;

alter table public.words replica identity full;
alter table public.streaks replica identity full;
alter table public.attachments replica identity full;
alter table public.members replica identity full;
alter table public.srs_states replica identity full;

do $$
declare
  target text;
begin
  foreach target in array array['words', 'streaks', 'attachments', 'members', 'srs_states']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', target);
    exception
      when duplicate_object then null;
      when sqlstate '42710' then null;
    end;
  end loop;
end $$;
