-- The monthly scheduling cycle, part 1: ScheduleMonth and its stages
-- (DOMAIN-MODEL v0.41 / D17; Lauren, Nov 23, 2026).
--
-- One row per residency × site × month moves through
--   team_editing → team_confirmed → sent_to_partner → partner_changes → final.
-- Every step is one database function with its permission check inside it,
-- so the website and the phone app behave the same:
--   open_schedule_month      point person, admins          (not open → team editing)
--   confirm_schedule_month   point person, admins          (team editing → team confirmed)
--   undo_confirm_schedule_month  point person, admins      (back, until sent)
--   send_schedule_month      Admin Lead, point person, admins (→ sent to partner; sending confirms)
--   finalize_schedule_month  Admin Lead, point person, admins (→ final, locked)
--   schedule_month_send_info  the same people: who the calendar goes to (resend)
-- Making the PDF and emailing it is the website's /api/schedule-month endpoint,
-- which calls these first.
--
-- Rules enforced here, not in screens:
--   * titles: while a month is in team editing (or not opened yet and not
--     reviewed), only the date's leader changes its title (plus the point
--     person and admins);
--   * after final, nobody but the point person and admins changes the month's
--     dates or who plays (everyone else goes through a ChangeRequest, part 2);
--   * the first change after sending moves the month to partner_changes.
-- Functions that make an allowed exception (part 2: "Canceled day-of",
-- "I wasn't there", approved requests) set iris.month_action = 'on'.
--
-- Additive only (expand): new type, table, functions, triggers and settings.
-- Nothing the phone app uses today is renamed or removed.

create type public.schedule_month_stage as enum
  ('team_editing', 'team_confirmed', 'sent_to_partner', 'partner_changes', 'final');

create table public.schedule_month (
  id            uuid primary key default gen_random_uuid(),
  residency_id  uuid not null references public.residency (id) on delete restrict,
  site_id       uuid not null references public.site (id) on delete restrict,
  month         date not null check (extract(day from month) = 1),
  stage         public.schedule_month_stage not null default 'team_editing',
  team_due_on   date not null,
  final_due_on  date not null,
  opened_at     timestamptz not null default now(),
  opened_by     uuid references public.person (id) on delete restrict,
  confirmed_at  timestamptz,
  confirmed_by  uuid references public.person (id) on delete restrict,
  sent_at       timestamptz,
  sent_by       uuid references public.person (id) on delete restrict,
  finalized_at  timestamptz,
  finalized_by  uuid references public.person (id) on delete restrict,
  updated_at    timestamptz not null default now(),
  unique (residency_id, site_id, month)
);
comment on table public.schedule_month is 'One building''s month of a residency on its way to the partner (DOMAIN-MODEL ScheduleMonth, v0.41).';

alter table public.schedule_month enable row level security;
revoke all on public.schedule_month from anon, authenticated;
grant select on public.schedule_month to authenticated;
-- The program's people see the stage; changes go through the functions below.
create policy "schedule_month: its people read" on public.schedule_month for select to authenticated
  using ((select public.can_view_residency(residency_id)));

insert into public.setting (key, value) values
  ('schedule_internal_due_day', '10'),
  ('schedule_partner_due_day', '15')
on conflict (key) do nothing;

alter table public.notification drop constraint notification_kind_check;
alter table public.notification add constraint notification_kind_check check (kind in (
  'no_program', 'deadline_reminder', 'deadline_missed', 'deadline_missed_summary', 'deadline_nudge', 'schedule_checked',
  'month_opened', 'month_reminder', 'change_requested', 'change_decided', 'absence_marked', 'not_there'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The ScheduleMonth a date belongs to (its building's month in the building's time zone), if opened.
create function public.session_schedule_month(p_session uuid)
returns public.schedule_month language sql stable security definer set search_path = ''
as $$
  select sm.*
  from public.session se
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  join public.schedule_month sm on sm.residency_id = se.residency_id and sm.site_id = st.id
   and sm.month = date_trunc('month', se.starts_at at time zone st.timezone)::date
  where se.id = p_session;
$$;
revoke all on function public.session_schedule_month(uuid) from public, anon;
grant execute on function public.session_schedule_month(uuid) to authenticated;

-- The day of the month before `m` given by a setting (10th, 15th).
create function public.schedule_due_on(p_month date, p_key text, p_default integer)
returns date language sql stable security definer set search_path = ''
as $$
  select ((p_month - interval '1 month')::date
          + (coalesce((select nullif(value, '')::integer from public.setting where key = p_key), p_default) - 1));
$$;
revoke all on function public.schedule_due_on(date, text, integer) from public, anon, authenticated;

-- One email to each of the residency's current point people.
create function public.notify_point_people(p_residency uuid, p_kind text, p_subject text, p_body text, p_dedupe text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select p_kind, p.id, p.email, left(p_subject, 300),
         p_body || chr(10) || chr(10) || 'You''re getting this because you''re the point person for ' || r.name || '.',
         p_dedupe || ':' || p.id
  from public.staff_assignment sa
  join public.person p on p.id = sa.person_id and p.active
  join public.residency r on r.id = sa.residency_id
  where sa.residency_id = p_residency and sa.role = 'point_person'
    and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    and p.id is distinct from (select auth.uid())
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function public.notify_point_people(uuid, text, text, text, text) from public, anon, authenticated;

-- Who a building's calendar goes to: its partner contacts marked "receives
-- calendar", with the point people, the Admin Lead and the sender copied.
create function public.calendar_recipients(p_residency uuid, p_site uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'to', coalesce((select jsonb_agg(distinct jsonb_build_object('name', pc.name, 'email', pc.email))
                    from public.partner_contact pc
                    join public.partner_contact_site pcs on pcs.contact_id = pc.id and pcs.site_id = p_site
                    where pc.active and pc.email is not null and 'calendar' = any (pc.receives)), '[]'::jsonb),
    'cc', coalesce((select jsonb_agg(distinct e) from (
             select p.email as e from public.staff_assignment sa join public.person p on p.id = sa.person_id and p.active
              where sa.residency_id = p_residency and sa.role = 'point_person'
                and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
             union
             select p.email from public.roster_member rm join public.season s on s.id = rm.season_id
              join public.person p on p.id = rm.person_id and p.active
              where s.residency_id = p_residency and rm.is_admin_lead and s.ends_on >= current_date
                and (rm.left_on is null or rm.left_on >= current_date)
             union
             select p.email from public.person p where p.id = (select auth.uid())
           ) x where e is not null), '[]'::jsonb));
$$;
revoke all on function public.calendar_recipients(uuid, uuid) from public, anon, authenticated;

create function public.require_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns public.schedule_month language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month;
begin
  select * into sm from public.schedule_month
   where residency_id = p_residency and site_id = p_site and month = date_trunc('month', p_month)::date
   for update;
  if not found then
    raise exception 'this month isn''t open for the team yet' using errcode = '23514';
  end if;
  return sm;
end;
$$;
revoke all on function public.require_schedule_month(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The steps
-- ---------------------------------------------------------------------------

-- Open a month for the team, at one building or (p_site null) every building
-- of the residency. Returns how many buildings were opened.
create function public.open_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; opened integer := 0; s record; label text; rname text;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the point person or an admin can open a month' using errcode = '42501';
  end if;
  if p_site is not null and not exists (select 1 from public.residency_site where residency_id = p_residency and site_id = p_site) then
    raise exception 'that site isn''t part of this residency' using errcode = '23514';
  end if;
  select name into rname from public.residency where id = p_residency;
  label := to_char(m, 'FMMonth YYYY');
  for s in select st.id, st.display_name from public.residency_site rs join public.site st on st.id = rs.site_id
            where rs.residency_id = p_residency and (p_site is null or rs.site_id = p_site) loop
    insert into public.schedule_month (residency_id, site_id, month, team_due_on, final_due_on, opened_by)
    values (p_residency, s.id, m,
            public.schedule_due_on(m, 'schedule_internal_due_day', 10),
            public.schedule_due_on(m, 'schedule_partner_due_day', 15),
            (select auth.uid()))
    on conflict (residency_id, site_id, month) do nothing;
    if found then
      opened := opened + 1;
      insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
      select 'month_opened', p.id, p.email,
             label || ' at ' || s.display_name || ' is open for the team',
             label || ' at ' || s.display_name || ' (' || rname || ') is open. By ' ||
             to_char(public.schedule_due_on(m, 'schedule_internal_due_day', 10), 'FMDay, FMMonth FMDD') || ':' || chr(10) ||
             '- add a title to each date you lead;' || chr(10) ||
             '- mark any date you can''t play (on the date, in the calendar);' || chr(10) ||
             '- propose a leader swap if you need one.',
             'month_opened:' || p_residency || ':' || s.id || ':' || m || ':' || p.id
      from public.month_players(p_residency, s.id, m) mp join public.person p on p.id = mp and p.active
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
  return opened;
end;
$$;
revoke all on function public.open_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.open_schedule_month(uuid, uuid, date) to authenticated;

-- The point person confirms the team's version (locks dates for musicians).
create function public.confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the point person or an admin can confirm a month' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage <> 'team_editing' then
    raise exception 'this month is already past team editing' using errcode = '23514';
  end if;
  -- Calendar version 1, "reviewed": the existing lock for musicians (v0.25).
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at)
  select p_residency, p_site, m, 1, 'reviewed', (select auth.uid()), now()
  where not exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m);
  update public.schedule_month set stage = 'team_confirmed', confirmed_at = now(), confirmed_by = (select auth.uid()), updated_at = now()
   where id = sm.id;
end;
$$;
revoke all on function public.confirm_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.confirm_schedule_month(uuid, uuid, date) to authenticated;

create function public.undo_confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the point person or an admin can undo confirming' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage <> 'team_confirmed' then
    raise exception 'only a confirmed month that hasn''t been sent can be reopened' using errcode = '23514';
  end if;
  delete from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and version = 1 and state = 'reviewed';
  update public.schedule_month set stage = 'team_editing', confirmed_at = null, confirmed_by = null, updated_at = now()
   where id = sm.id;
end;
$$;
revoke all on function public.undo_confirm_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.undo_confirm_schedule_month(uuid, uuid, date) to authenticated;

-- Send the draft calendar (the 10th). Sending confirms the month if the point
-- person hasn't (Lauren, Q3). Publishes the month's dates (publish_month) and
-- returns what the endpoint needs to email it.
create function public.send_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month; v_export uuid;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'only the Admin Lead, the point person or an admin can send the calendar' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage not in ('team_editing', 'team_confirmed') then
    raise exception 'this month''s calendar has already been sent' using errcode = '23514';
  end if;
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at)
  select p_residency, p_site, m, 1, 'reviewed', (select auth.uid()), now()
  where not exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m);
  perform set_config('iris.month_action', 'on', true);
  v_export := public.publish_month(p_residency, p_site, m);
  perform set_config('iris.month_action', 'off', true);
  update public.schedule_month
     set stage = 'sent_to_partner', sent_at = now(), sent_by = (select auth.uid()),
         confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, (select auth.uid())),
         updated_at = now()
   where id = sm.id;
  return jsonb_build_object('export_id', v_export, 'version', 1, 'final', false)
         || public.calendar_recipients(p_residency, p_site);
end;
$$;
revoke all on function public.send_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.send_schedule_month(uuid, uuid, date) to authenticated;

-- Mark the month final and send the final calendar (by the 15th). A new
-- calendar version is made when anything changed after sending.
create function public.finalize_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month; v_export uuid; v_version integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'only the Admin Lead, the point person or an admin can mark a month final' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage not in ('sent_to_partner', 'partner_changes') then
    raise exception 'send the calendar to the partner before marking the month final' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  if sm.stage = 'partner_changes' or exists (
       select 1 from public.month_sessions(p_residency, p_site, m) ms(id)
       join public.session se on se.id = ms.id where se.schedule_state = 'draft') then
    v_export := public.new_calendar_version(p_residency, p_site, m, null);
  end if;
  perform set_config('iris.month_action', 'off', true);
  select id, version into v_export, v_version from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent'
   order by version desc limit 1;
  update public.schedule_month set stage = 'final', finalized_at = now(), finalized_by = (select auth.uid()), updated_at = now()
   where id = sm.id;
  return jsonb_build_object('export_id', v_export, 'version', v_version, 'final', true)
         || public.calendar_recipients(p_residency, p_site);
end;
$$;
revoke all on function public.finalize_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.finalize_schedule_month(uuid, uuid, date) to authenticated;

-- What to email again (e.g. the email failed): the latest version and recipients. Changes nothing.
create function public.schedule_month_send_info(p_residency uuid, p_site uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month; v_export uuid; v_version integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into sm from public.schedule_month where residency_id = p_residency and site_id = p_site and month = m;
  if not found or sm.stage not in ('sent_to_partner', 'partner_changes', 'final') then
    raise exception 'this month''s calendar hasn''t been sent yet' using errcode = '23514';
  end if;
  select id, version into v_export, v_version from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent'
   order by version desc limit 1;
  return jsonb_build_object('export_id', v_export, 'version', v_version, 'final', sm.stage = 'final')
         || public.calendar_recipients(p_residency, p_site);
end;
$$;
revoke all on function public.schedule_month_send_info(uuid, uuid, date) from public, anon;
grant execute on function public.schedule_month_send_info(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Rules on dates and who plays
-- ---------------------------------------------------------------------------

create function public.session_month_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month; rid uuid := coalesce(new.residency_id, old.residency_id);
begin
  if (select auth.uid()) is null or coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    select m.* into sm from public.location l join public.site st on st.id = l.site_id
      join public.schedule_month m on m.residency_id = new.residency_id and m.site_id = st.id
       and m.month = date_trunc('month', new.starts_at at time zone st.timezone)::date
     where l.id = new.location_id;
  else
    sm := public.session_schedule_month(old.id);
  end if;
  if sm.stage = 'final' and not public.can_schedule(rid) then
    raise exception 'this month is final; ask the point person for changes' using errcode = '42501';
  end if;
  -- Titles while the team edits: only the date's leader (v0.41, Q1).
  if tg_op = 'UPDATE' and new.title is distinct from old.title and old.schedule_state = 'draft'
     and not public.can_schedule(rid)
     and (sm.stage = 'team_editing' or (sm.id is null and not public.is_session_month_reviewed(old.id)))
     and not public.is_session_leader(old.id) then
    raise exception 'only this date''s leader changes its title' using errcode = '42501';
  end if;
  -- The first change after sending: partner changes.
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.session_month_rules() from public, anon, authenticated;
create trigger session_month_rules before insert or update on public.session
  for each row execute function public.session_month_rules();

create function public.assignment_month_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month; rid uuid;
begin
  if (select auth.uid()) is null or coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  sm := public.session_schedule_month(coalesce(new.session_id, old.session_id));
  if sm.id is null then return coalesce(new, old); end if;
  rid := sm.residency_id;
  if sm.stage = 'final' and not public.can_schedule(rid) then
    raise exception 'this month is final; ask the point person for changes' using errcode = '42501';
  end if;
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.assignment_month_rules() from public, anon, authenticated;
create trigger assignment_month_rules before insert or update or delete on public.session_assignment
  for each row execute function public.assignment_month_rules();
