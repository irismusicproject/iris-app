-- Roles and monthly programs (DOMAIN-MODEL v0.18, decided by Lauren Nov 22,
-- 2026, after trying the prototype as point person, admin lead and musician).
--
-- Who does what:
--   * Point person and admins ("planners", can_schedule): everything. Set up
--     weekly and monthly programs, fill months and the season, leaders,
--     "No Program", mark reviewed.
--   * Admin Lead: publish and download; update PUBLISHED dates after the
--     partner's staff asks (time, room, title, "No Program" or restore) and
--     download the updated version; add one-time events.
--   * Every roster musician (Admin Lead included), on DRAFT dates they play
--     in: title, notes, room, musicians, and pick or swap the leader;
--     date and time of special events they play in.
-- Monthly programs: a Series can repeat monthly on the 1st-4th weekday.
--
-- Needs Ryan's review (permissions).

-- ---------------------------------------------------------------------------
-- Planners are now the point person and admins only.
-- ---------------------------------------------------------------------------
create or replace function public.can_schedule(p_residency uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or public.is_current_staff(p_residency, 'point_person');
$$;

-- The signed-in person plays in (is assigned to, not absent) a session.
create function public.is_playing(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.session_assignment
    where session_id = p_session and person_id = (select auth.uid()) and status <> 'absent');
$$;
revoke all on function public.is_playing(uuid) from public, anon;
grant execute on function public.is_playing(uuid) to authenticated;

-- The Admin Lead can still publish and make updated versions.
create or replace function public.publish_month(p_residency uuid, p_site uuid, p_month date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; v public.calendar_export%rowtype; missing integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and version = 1;
  if not found then
    raise exception 'the point person must mark this month reviewed first' using errcode = '23514';
  end if;
  if v.state = 'sent' then
    raise exception 'this month is already published; download an updated version instead' using errcode = '23514';
  end if;
  select count(*) into missing from public.month_sessions(p_residency, p_site, m) ms(id)
   join public.session se on se.id = ms.id
   where se.schedule_state <> 'canceled' and se.kind = 'group_session'
     and (select count(*) from public.session_assignment sa
          where sa.session_id = se.id and sa.role = 'leader' and sa.status <> 'absent') <> 1;
  if missing > 0 then
    raise exception '% group session(s) still need a leader', missing using errcode = '23514';
  end if;
  perform set_config('iris.publishing', 'on', true);
  update public.session set schedule_state = 'published'
   where id in (select * from public.month_sessions(p_residency, p_site, m)) and schedule_state = 'draft';
  perform set_config('iris.publishing', 'off', true);
  update public.calendar_export
     set state = 'sent', generated_by = (select auth.uid()), generated_at = now(), sent_at = now()
   where id = v.id;
  return v.id;
end;
$$;

create or replace function public.new_calendar_version(p_residency uuid, p_site uuid, p_month date, p_partner_feedback text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; last_v integer; v_id uuid;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select max(version) into last_v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent';
  if last_v is null then
    raise exception 'publish version 1 first' using errcode = '23514';
  end if;
  perform set_config('iris.publishing', 'on', true);
  update public.session set schedule_state = 'published'
   where id in (select * from public.month_sessions(p_residency, p_site, m)) and schedule_state = 'draft';
  perform set_config('iris.publishing', 'off', true);
  insert into public.calendar_export (residency_id, site_id, month, version, state,
                                      generated_by, generated_at, sent_at, partner_feedback)
  values (p_residency, p_site, m, last_v + 1, 'sent', (select auth.uid()), now(), now(), p_partner_feedback)
  returning calendar_export.id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
drop policy "session: roster musicians edit drafts" on public.session;
create policy "session: musicians edit drafts they play in" on public.session for update to authenticated
  using (schedule_state = 'draft' and (select public.is_on_current_roster(residency_id)) and (select public.is_playing(id)))
  with check (schedule_state = 'draft' and (select public.is_on_current_roster(residency_id)));
create policy "session: admin lead updates published dates" on public.session for update to authenticated
  using (schedule_state in ('published', 'canceled') and (select public.is_current_admin_lead(residency_id)))
  with check ((select public.is_current_admin_lead(residency_id)));
create policy "session: admin lead adds one-time events" on public.session for insert to authenticated
  with check (series_id is null and (select public.is_current_admin_lead(residency_id)));

create or replace function public.session_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare planner boolean;
begin
  if not public.location_in_residency(new.residency_id, new.location_id) then
    raise exception 'the location must be at one of the residency''s sites' using errcode = '23514';
  end if;
  if new.series_id is not null and not exists (
    select 1 from public.series where id = new.series_id and residency_id = new.residency_id
  ) then
    raise exception 'the series belongs to another residency' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.residency_id is distinct from old.residency_id then
      raise exception 'a session cannot move to another residency' using errcode = '42501';
    end if;
    planner := (select auth.uid()) is null or public.can_schedule(old.residency_id);
    if not planner and old.schedule_state in ('published', 'canceled') then
      -- The Admin Lead updating a published date after partner feedback.
      if new.series_id is distinct from old.series_id
         or new.kind is distinct from old.kind
         or new.has_set_time is distinct from old.has_set_time
         or new.is_special_event is distinct from old.is_special_event
         or new.is_extra is distinct from old.is_extra
         or new.billable is distinct from old.billable then
        raise exception 'the admin lead can change a published date''s time, room, title and notes, or make it "No Program"'
          using errcode = '42501';
      end if;
    elsif not planner then
      -- Musicians on a draft they play in: title, room and notes; date and
      -- time only for special events.
      if new.schedule_state is distinct from old.schedule_state
         or new.series_id is distinct from old.series_id
         or new.kind is distinct from old.kind
         or new.has_set_time is distinct from old.has_set_time
         or new.is_special_event is distinct from old.is_special_event
         or new.is_extra is distinct from old.is_extra
         or new.billable is distinct from old.billable
         or new.cancellation_reason is distinct from old.cancellation_reason
         or new.public_note is distinct from old.public_note
         or (not old.is_special_event and (
               new.starts_at is distinct from old.starts_at
               or new.scheduled_minutes is distinct from old.scheduled_minutes
               or new.call_time is distinct from old.call_time)) then
        raise exception 'musicians can change a draft''s title, room and notes (and a special event''s date and time)'
          using errcode = '42501';
      end if;
    end if;
    if old.schedule_state = 'draft' and new.schedule_state = 'published'
       and coalesce(current_setting('iris.publishing', true), '') <> 'on' then
      raise exception 'publish a month with publish_month()' using errcode = '42501';
    end if;
    if old.schedule_state = 'canceled' and new.schedule_state not in ('canceled', 'draft') then
      raise exception 'a restored date comes back as a draft' using errcode = '42501';
    end if;
    if old.schedule_state = 'canceled' and new.schedule_state = 'draft' then
      new.cancellation_reason := null;
      new.canceled_at := null;
    end if;
    if old.schedule_state = 'published' and new.schedule_state = 'draft' then
      raise exception 'a published session can''t go back to draft' using errcode = '42501';
    end if;
  elsif new.schedule_state <> 'draft' then
    raise exception 'new sessions start as drafts' using errcode = '42501';
  end if;
  if new.schedule_state = 'canceled' and new.canceled_at is null then
    new.canceled_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who plays: musicians change drafts they play in (and staff a brand-new
-- event that has nobody yet); they can pick or swap the leader.
-- ---------------------------------------------------------------------------
drop policy "session_assignment: roster musicians add participants to drafts" on public.session_assignment;
create policy "session_assignment: musicians add to drafts they play in" on public.session_assignment
  for insert to authenticated
  with check (status = 'assigned' and exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'draft'
      and (select public.is_on_current_roster(ss.residency_id))
      and ((select public.is_playing(ss.id))
           or not exists (select 1 from public.session_assignment x where x.session_id = ss.id))));
drop policy "session_assignment: remove from drafts" on public.session_assignment;
create policy "session_assignment: remove from drafts" on public.session_assignment for delete to authenticated
  using (exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'draft'
      and ((select public.can_schedule(ss.residency_id))
           or (session_assignment.role = 'participant' and (select public.is_on_current_roster(ss.residency_id))
               and (select public.is_playing(ss.id))))));
create policy "session_assignment: musicians pick leaders (drafts)" on public.session_assignment
  for update to authenticated
  using (exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'draft'
      and (select public.is_on_current_roster(ss.residency_id)) and (select public.is_playing(ss.id))))
  with check (true);

-- Musicians may change only the leader role; status and subs go through
-- mark_absent_with_substitute() (which runs as the owner, not "authenticated").
create function public.assignment_change_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and not public.can_schedule((select residency_id from public.session where id = new.session_id))
     and (new.status is distinct from old.status or new.substitute_for_id is distinct from old.substitute_for_id) then
    raise exception 'musicians can only pick or swap the leader here' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger assignment_change_guard before update on public.session_assignment
  for each row execute function public.assignment_change_guard();

-- ---------------------------------------------------------------------------
-- Monthly programs (1st-4th weekday of the month)
-- ---------------------------------------------------------------------------
alter table public.series
  add column recurrence text not null default 'weekly' check (recurrence in ('weekly', 'monthly')),
  add column week_of_month smallint check (week_of_month between 1 and 4),
  add constraint series_monthly_shape check (
    recurrence = 'weekly' or (week_of_month is not null and cardinality(weekdays) = 1));
comment on column public.series.week_of_month is 'Monthly programs: 1st-4th occurrence of the weekday in the month.';

create or replace function public.generate_series_month(p_series uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  s public.series%rowtype; tz text; d date; created integer := 0; new_id uuid;
  first_day date := date_trunc('month', p_month)::date;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id
   where l.id = s.default_location_id;
  for d in select g::date from generate_series(first_day, (first_day + interval '1 month - 1 day')::date, interval '1 day') g loop
    continue when extract(isodow from d)::smallint <> all (s.weekdays);
    continue when d < s.active_from or (s.active_until is not null and d > s.active_until);
    -- Monthly programs: only the Nth weekday of the month (1st-4th), v0.18.
    continue when s.recurrence = 'monthly' and ((extract(day from d)::int - 1) / 7 + 1) <> s.week_of_month;
    insert into public.session (residency_id, series_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes)
    values (s.residency_id, s.id, s.kind, s.title, s.default_location_id,
            (d + coalesce(s.start_time, time '00:00')) at time zone tz, s.start_time is not null, s.minutes)
    on conflict (series_id, starts_at) where series_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      created := created + 1;
      -- Usual musicians, plus the usual leader (if any) as the date's leader.
      insert into public.session_assignment (session_id, person_id, role)
      select new_id, p.person_id, case when p.person_id = s.default_leader_id then 'leader'::public.assignment_role else 'participant' end
      from (select sdp.person_id from public.series_default_person sdp where sdp.series_id = s.id
            union select s.default_leader_id where s.default_leader_id is not null) p
      where exists (select 1 from public.roster_member rm join public.season se on se.id = rm.season_id
                    where se.residency_id = s.residency_id and rm.person_id = p.person_id
                      and d between se.starts_on and se.ends_on and (rm.left_on is null or rm.left_on >= d));
      new_id := null;
    end if;
  end loop;
  return created;
end;
$$;
