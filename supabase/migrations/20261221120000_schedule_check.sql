-- "Done reviewing" (DOMAIN-MODEL v0.35; Lauren, Nov 22, 2026).
--
-- Each musician playing at a building in a month marks that building's draft
-- month checked, once they've looked over their dates. The point person sees
-- a checklist on the month view and gets one email when everyone playing
-- that month is done. Marking the month reviewed doesn't wait for it (the
-- screen warns). A musician can still edit their dates until the month is
-- reviewed; an edit after "Done" flags their entry "changed since".
--
-- Additive only: a new table, two functions, a trigger and a notification kind.

create table public.schedule_check (
  id           uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.residency (id) on delete cascade,
  site_id      uuid not null references public.site (id) on delete restrict,
  month        date not null check (month = date_trunc('month', month)::date),
  person_id    uuid not null references public.person (id) on delete cascade,
  checked_at   timestamptz not null default now(),
  changed_at   timestamptz,
  unique (residency_id, site_id, month, person_id)
);
comment on table public.schedule_check is
  'A musician''s "Done reviewing" for one building''s draft month (v0.35). changed_at: they edited a date there afterwards.';
create index schedule_check_person_idx on public.schedule_check (person_id);

alter table public.schedule_check enable row level security;
revoke all on public.schedule_check from anon;
grant select on public.schedule_check to authenticated;
-- The program's people see the checklist; changes go through the functions below.
create policy "schedule_check: its people read" on public.schedule_check for select to authenticated
  using ((select public.can_view_residency(residency_id)));

alter table public.notification drop constraint notification_kind_check;
alter table public.notification add constraint notification_kind_check check (kind in (
  'no_program', 'deadline_reminder', 'deadline_missed', 'deadline_missed_summary', 'deadline_nudge', 'schedule_checked'));

-- Who plays at a building in a month: anyone not absent on a date that isn't "No Program".
create function public.month_players(p_residency uuid, p_site uuid, p_month date)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct sa.person_id
  from public.month_sessions(p_residency, p_site, p_month) ms(id)
  join public.session se on se.id = ms.id and se.schedule_state <> 'canceled'
  join public.session_assignment sa on sa.session_id = se.id and sa.status <> 'absent';
$$;
revoke all on function public.month_players(uuid, uuid, date) from public, anon;
grant execute on function public.month_players(uuid, uuid, date) to authenticated;

-- "Done reviewing". Returns true when everyone playing that month is done
-- (and then emails the point person(s), once per building and month).
create function public.mark_schedule_checked(p_residency uuid, p_site uuid, p_month date)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  m date := date_trunc('month', p_month)::date;
  site_name text; residency_name text; month_label text; names text;
  all_done boolean;
begin
  if me is null or not public.is_on_current_roster(p_residency) then
    raise exception 'only musicians on this program''s roster can do this' using errcode = '42501';
  end if;
  if not exists (select 1 from public.month_players(p_residency, p_site, m) p where p = me) then
    raise exception 'you aren''t playing at this building this month' using errcode = '23514';
  end if;
  if exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m) then
    raise exception 'this month has already been reviewed' using errcode = '23514';
  end if;
  insert into public.schedule_check (residency_id, site_id, month, person_id)
  values (p_residency, p_site, m, me)
  on conflict (residency_id, site_id, month, person_id) do update set checked_at = now(), changed_at = null;

  select not exists (
    select 1 from public.month_players(p_residency, p_site, m) p
    where not exists (select 1 from public.schedule_check c
                      where c.residency_id = p_residency and c.site_id = p_site and c.month = m and c.person_id = p))
    into all_done;
  if all_done then
    select display_name into site_name from public.site where id = p_site;
    select name into residency_name from public.residency where id = p_residency;
    month_label := to_char(m, 'FMMonth YYYY');
    select string_agg(split_part(pe.name, ' ', 1), ', ' order by pe.name) into names
      from public.month_players(p_residency, p_site, m) p join public.person pe on pe.id = p;
    insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
    select 'schedule_checked', p.id, p.email,
           site_name || ', ' || month_label || ': musicians are done reviewing',
           'Everyone playing at ' || site_name || ' in ' || month_label || ' (' || residency_name || ') has checked their dates: ' || names || '.' || chr(10) || chr(10) ||
           'Next: set any missing leaders, review the month with the Admin Lead, and mark it reviewed.' || chr(10) || chr(10) ||
           'You''re getting this because you''re the point person for ' || residency_name || '.',
           'schedule_checked:' || p_residency || ':' || p_site || ':' || m || ':' || p.id
    from public.staff_assignment sa
    join public.person p on p.id = sa.person_id and p.active
    where sa.residency_id = p_residency and sa.role = 'point_person'
      and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    on conflict (dedupe_key) do nothing;
  end if;
  return all_done;
end;
$$;
revoke all on function public.mark_schedule_checked(uuid, uuid, date) from public, anon;
grant execute on function public.mark_schedule_checked(uuid, uuid, date) to authenticated;

-- Undo "Done reviewing" (until the month is reviewed).
create function public.undo_schedule_checked(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m) then
    raise exception 'this month has already been reviewed' using errcode = '23514';
  end if;
  delete from public.schedule_check
   where residency_id = p_residency and site_id = p_site and month = m and person_id = (select auth.uid());
end;
$$;
revoke all on function public.undo_schedule_checked(uuid, uuid, date) from public, anon;
grant execute on function public.undo_schedule_checked(uuid, uuid, date) to authenticated;

-- "Changed since": a musician edits a date at a building and month they've
-- already marked done. Only their own entry is flagged.
create function public.flag_schedule_check_changed(p_session uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.schedule_check c set changed_at = now()
  from public.session se
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  where se.id = p_session
    and c.residency_id = se.residency_id and c.site_id = st.id
    and c.month = date_trunc('month', se.starts_at at time zone st.timezone)::date
    and c.person_id = (select auth.uid());
$$;
revoke all on function public.flag_schedule_check_changed(uuid) from public, anon, authenticated;

create function public.session_schedule_check_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_table_name = 'session' then
      perform public.flag_schedule_check_changed(new.id);
    else
      perform public.flag_schedule_check_changed(coalesce(new.session_id, old.session_id));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.session_schedule_check_changed() from public, anon, authenticated;
create trigger session_schedule_check_changed after update on public.session
  for each row execute function public.session_schedule_check_changed();
create trigger session_assignment_schedule_check_changed after insert or update or delete on public.session_assignment
  for each row execute function public.session_schedule_check_changed();
