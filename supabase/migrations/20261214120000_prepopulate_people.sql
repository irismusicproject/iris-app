-- Pre-adding people before they're invited (DOMAIN-MODEL v0.29; decided by
-- Lauren Nov 22, 2026). Admins can add a person (with their email) without
-- sending the invite, put them on rosters and schedules, and invite them
-- later. invited_at is empty until the invite is sent.

alter table public.person add column invited_at timestamptz;
comment on column public.person.invited_at is
  'When the sign-in invite (or "set your password" email) was last sent. Empty = added by an admin, not invited yet (v0.29).';

-- Everyone added before v0.29 was invited when they were added.
update public.person set invited_at = created_at where invited_at is null;

-- Only admins (or server-side tasks) change it.
create function public.person_invited_at_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and new.invited_at is distinct from old.invited_at then
    raise exception 'only admins can change that field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger person_invited_at_guard before update of invited_at on public.person
  for each row execute function public.person_invited_at_guard();
