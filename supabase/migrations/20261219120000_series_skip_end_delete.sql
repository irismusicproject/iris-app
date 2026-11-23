-- Weekly programs: skip a week of the month, end mid-season, delete
-- duplicates (DOMAIN-MODEL v0.34; Lauren, Nov 22, 2026).
--
-- 1. Skip weeks. A weekly program can skip the 1st-4th week of each month
--    (e.g. Landow most Mondays, but the 2nd Monday the ensemble is at Revitz,
--    set up as a monthly program there). The skipped date is still made, as
--    "No Program" (reason "other"), so the building's calendar shows why.
--    Saving the program turns future draft dates on a skipped week into
--    "No Program" too. Nobody is emailed for these: they're the program's own
--    schedule, not news.
-- 2. End a program (end_series): pick a last date. Dates after it are removed
--    when they're drafts (or "No Program" in a month not yet sent to the
--    partner) and nothing hangs on them. Published dates stay and are listed
--    so the Admin Lead or point person can make them "No Program".
-- 3. Delete a program (delete_series): for duplicates. Removes the program
--    and every date of it, but only if no date has been documented, had
--    relationship building logged against it, or is in an approved week.
--
-- Point person and admins only (can_schedule), like setting programs up.
-- Additive only: nothing the phone app uses is renamed or removed.

-- 1. Skip weeks ---------------------------------------------------------------
alter table public.series
  add column skip_weeks_of_month smallint[] not null default '{}'
    check (skip_weeks_of_month <@ '{1,2,3,4}'::smallint[]),
  add constraint series_skip_weekly_only
    check (recurrence = 'weekly' or cardinality(skip_weeks_of_month) = 0);
comment on column public.series.skip_weeks_of_month is
  'Weekly programs: weeks of the month (1st-4th weekday occurrence) made "No Program" instead (v0.34).';

-- Deletions are recorded too.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in ('insert', 'update', 'delete'));

-- 1st-4th (or 5th) occurrence of the weekday in its month.
create function public.week_of_month(p_day date)
returns smallint language sql immutable set search_path = ''
as $$ select ((extract(day from p_day)::int - 1) / 7 + 1)::smallint $$;

-- Automatic "No Program" dates don't email the point person.
create or replace function public.notify_no_program()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  tz text;
  who text;
  label text;
begin
  if coalesce(current_setting('iris.auto_no_program', true), '') = 'on' then
    return new;
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id where l.id = new.location_id;
  select p.name into who from public.person p where p.id = (select auth.uid());
  label := to_char(new.starts_at at time zone coalesce(tz, 'America/New_York'), 'FMDay, FMMonth FMDD') ||
           case when new.has_set_time then ' at ' || to_char(new.starts_at at time zone coalesce(tz, 'America/New_York'), 'FMHH12:MI AM') else '' end;
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'no_program', p.id, p.email,
         'No Program: ' || new.title || ', ' || label,
         coalesce(who, 'Someone') || ' changed ' || new.title || ' on ' || label || ' (' || r.name || ') to "No Program".' || chr(10) ||
         'Reason: ' || initcap(coalesce(new.cancellation_reason::text, 'not given')) || '.' || chr(10) || chr(10) ||
         'You''re getting this because you''re the point person for ' || r.name || '.',
         'no_program:' || new.id || ':' || p.id || ':' || extract(epoch from coalesce(new.canceled_at, now()))::bigint
  from public.staff_assignment sa
  join public.person p on p.id = sa.person_id and p.active
  join public.residency r on r.id = new.residency_id
  where sa.residency_id = new.residency_id and sa.role = 'point_person'
    and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    and p.id is distinct from (select auth.uid())
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.notify_no_program() from public, anon, authenticated;

-- Filling a month: skipped weeks are made as "No Program".
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
    continue when s.recurrence = 'monthly' and public.week_of_month(d) <> s.week_of_month;
    insert into public.session (residency_id, series_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes)
    values (s.residency_id, s.id, s.kind, s.title, s.default_location_id,
            (d + coalesce(s.start_time, time '00:00')) at time zone tz, s.start_time is not null, s.minutes)
    on conflict (series_id, starts_at) where series_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      created := created + 1;
      if s.recurrence = 'weekly' and public.week_of_month(d) = any (s.skip_weeks_of_month) then
        -- Skipped week (v0.34): "No Program", nobody on it.
        perform set_config('iris.auto_no_program', 'on', true);
        update public.session set schedule_state = 'canceled', cancellation_reason = 'other' where id = new_id;
        perform set_config('iris.auto_no_program', '', true);
      else
        -- Usual musicians, plus the usual leader (if any) as the date's leader.
        insert into public.session_assignment (session_id, person_id, role)
        select new_id, p.person_id, case when p.person_id = s.default_leader_id then 'leader'::public.assignment_role else 'participant' end
        from (select sdp.person_id from public.series_default_person sdp where sdp.series_id = s.id
              union select s.default_leader_id where s.default_leader_id is not null) p
        where exists (select 1 from public.roster_member rm join public.season se on se.id = rm.season_id
                      where se.residency_id = s.residency_id and rm.person_id = p.person_id
                        and d between se.starts_on and se.ends_on and (rm.left_on is null or rm.left_on >= d));
      end if;
      new_id := null;
    end if;
  end loop;
  return created;
end;
$$;

-- Helpers for removing dates --------------------------------------------------
-- Something hangs on this date: documentation, relationship building logged
-- against it, or an approved week.
create function public.session_is_kept(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.session_report r where r.session_id = p_session)
      or exists (select 1 from public.relationship_activity ra where ra.session_id = p_session)
      or public.is_session_in_approved_week(p_session);
$$;
revoke all on function public.session_is_kept(uuid) from public, anon, authenticated;

-- Removes one date and who played it, recording both in audit_log.
create function public.remove_session(p_session uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.session_assignment; se public.session;
begin
  for a in select * from public.session_assignment where session_id = p_session loop
    insert into public.audit_log (actor_id, table_name, row_id, action, before)
    values ((select auth.uid()), 'session_assignment', a.id, 'delete', to_jsonb(a));
  end loop;
  delete from public.session_assignment where session_id = p_session;
  delete from public.session where id = p_session returning * into se;
  insert into public.audit_log (actor_id, table_name, row_id, action, before)
  values ((select auth.uid()), 'session', se.id, 'delete', to_jsonb(se));
end;
$$;
revoke all on function public.remove_session(uuid) from public, anon, authenticated;

-- Brings a program's dates in line with its settings: removes removable dates
-- outside its start and end, and makes future drafts on skipped weeks
-- "No Program". Returns {removed, skipped}.
create function public.tidy_series_dates(p_series uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  s public.series%rowtype; r record; removed integer := 0; skipped integer := 0;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in
    select se.id, se.schedule_state, l.site_id, (se.starts_at at time zone st.timezone)::date as d,
           (now() at time zone st.timezone)::date as today
    from public.session se
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    where se.series_id = p_series
  loop
    if (r.d < s.active_from or (s.active_until is not null and r.d > s.active_until)) then
      -- Outside the program's dates: drafts, and "No Program" in a month the
      -- partner hasn't been sent, go when nothing hangs on them.
      if (r.schedule_state = 'draft'
          or (r.schedule_state = 'canceled' and not exists (
                select 1 from public.calendar_export ce
                where ce.residency_id = s.residency_id and ce.site_id = r.site_id
                  and ce.month = date_trunc('month', r.d)::date and ce.state = 'sent')))
         and not public.session_is_kept(r.id) then
        perform public.remove_session(r.id);
        removed := removed + 1;
      end if;
    elsif s.recurrence = 'weekly' and r.schedule_state = 'draft' and r.d >= r.today
          and public.week_of_month(r.d) = any (s.skip_weeks_of_month)
          and not public.session_is_kept(r.id) then
      perform set_config('iris.auto_no_program', 'on', true);
      update public.session set schedule_state = 'canceled', cancellation_reason = 'other' where id = r.id;
      perform set_config('iris.auto_no_program', '', true);
      skipped := skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('removed', removed, 'skipped', skipped);
end;
$$;
revoke all on function public.tidy_series_dates(uuid) from public, anon;
grant execute on function public.tidy_series_dates(uuid) to authenticated;

-- 2. End a program ------------------------------------------------------------
-- Returns {removed, skipped, published: [{id, starts_at}]}: published dates
-- after the last date that are still on the calendar.
create function public.end_series(p_series uuid, p_last date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.series%rowtype; result jsonb;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_last is null or p_last < s.active_from then
    raise exception 'the last date is before the program starts; delete it instead' using errcode = '23514';
  end if;
  update public.series set active_until = p_last where id = p_series;
  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values ((select auth.uid()), 'series', s.id, 'update', to_jsonb(s), (select to_jsonb(x) from public.series x where x.id = p_series));
  result := public.tidy_series_dates(p_series);
  return result || jsonb_build_object('published', coalesce((
    select jsonb_agg(jsonb_build_object('id', se.id, 'starts_at', se.starts_at) order by se.starts_at)
    from public.session se
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    where se.series_id = p_series and se.schedule_state = 'published'
      and (se.starts_at at time zone st.timezone)::date > p_last), '[]'::jsonb));
end;
$$;
revoke all on function public.end_series(uuid, date) from public, anon;
grant execute on function public.end_series(uuid, date) to authenticated;

-- 3. Delete a program ---------------------------------------------------------
-- Returns how many dates were removed with it.
create function public.delete_series(p_series uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare s public.series%rowtype; n integer := 0; sid uuid;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.session se join public.session_report r on r.session_id = se.id where se.series_id = p_series) then
    raise exception 'some dates of this program are documented; end it instead' using errcode = '23514';
  end if;
  if exists (select 1 from public.session se join public.relationship_activity ra on ra.session_id = se.id where se.series_id = p_series) then
    raise exception 'relationship building is logged on some dates of this program; end it instead' using errcode = '23514';
  end if;
  if exists (select 1 from public.session se where se.series_id = p_series and public.is_session_in_approved_week(se.id)) then
    raise exception 'some dates of this program are in an approved week; end it instead' using errcode = '23514';
  end if;
  for sid in select id from public.session where series_id = p_series loop
    perform public.remove_session(sid);
    n := n + 1;
  end loop;
  delete from public.series where id = p_series;
  insert into public.audit_log (actor_id, table_name, row_id, action, before)
  values ((select auth.uid()), 'series', s.id, 'delete', to_jsonb(s));
  return n;
end;
$$;
revoke all on function public.delete_series(uuid) from public, anon;
grant execute on function public.delete_series(uuid) to authenticated;
