-- Safe to run on the live Livingo database.
-- Keeps the existing pair, members, streak, and the bonjour card.
-- Also fixes join_pair so the record variable does not shadow plpgsql's FOUND.

create table if not exists public.pair_lock (
  id int primary key check (id = 1),
  pair_id uuid,
  created_at timestamptz not null default now()
);
alter table public.pair_lock enable row level security;
revoke all on public.pair_lock from anon, authenticated;

insert into public.pair_lock (id, pair_id)
select 1, id from public.pairs
order by created_at
limit 1
on conflict (id) do nothing;

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

drop trigger if exists pairs_only_one on public.pairs;
create trigger pairs_only_one
before insert on public.pairs
for each row execute function public.enforce_one_pair();

revoke all on function public.enforce_one_pair() from public, anon, authenticated;

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

grant execute on function public.join_pair(text, text, text, text) to authenticated;

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

drop trigger if exists members_pair_size on public.members;
create trigger members_pair_size
before insert on public.members
for each row execute function public.enforce_pair_member();

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
revoke all on function public.enforce_pair_member() from public, anon, authenticated;
