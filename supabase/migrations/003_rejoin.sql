-- 003: let a member rejoin from a new device with code + same name + same language.
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
  select * into v_pair from public.pairs where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    raise exception 'That code doesn''t match a pair.';
  end if;
  -- Rejoin: same code + same language + same name moves that seat to this device.
  update public.members
     set user_id = auth.uid(), timezone = trim(p_timezone)
   where pair_id = v_pair.id and teaches = p_teaches
     and lower(trim(display_name)) = lower(trim(p_display_name));
  if found then
    return;
  end if;
  if (select count(*) from public.members) >= 2 then
    raise exception 'This Livingo is private.';
  end if;
  insert into public.members (pair_id, user_id, display_name, teaches, timezone)
  values (v_pair.id, auth.uid(), trim(p_display_name), p_teaches, trim(p_timezone));
end;
$$;

grant execute on function public.join_pair(text, text, text, text) to authenticated;
