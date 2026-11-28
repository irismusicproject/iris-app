-- D20 follow-up (Ryan, Nov 27, 2026): months fill themselves when weekly
-- programs are set; there are no "Fill in [month]" buttons any more.
-- Saving a weekly program already makes its dates (part 2). This adds:
--   * a new season, or a season whose dates change, makes the dates of its
--     programs' weekly programs (those with no Ends date stop at the season's end);
--   * a one-time backfill for weekly programs that have no dates yet;
--   * the generators may also run with no one signed in (the system itself),
--     and anon can no longer call them.

create or replace function public.generate_series_month(p_series uuid, p_month date, p_until date default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  s public.series%rowtype; tz text; d date; created integer := 0; new_id uuid;
  first_day date := date_trunc('month', p_month)::date;
begin
  select * into s from public.series where id = p_series;
  -- Signed in: the Iris Supervisor or an admin. No one signed in: the
  -- system itself (a season's trigger, the backfill below, the server); anon
  -- can't call these at all (grants below).
  if not found or ((select auth.uid()) is not null and not public.can_schedule(s.residency_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id
   where l.id = s.default_location_id;
  for d in select g::date from generate_series(first_day, (first_day + interval '1 month - 1 day')::date, interval '1 day') g loop
    continue when extract(isodow from d)::smallint <> all (s.weekdays);
    continue when d < s.active_from or (s.active_until is not null and d > s.active_until);
    -- D20: a program with no Ends date stops at its season's end.
    continue when p_until is not null and d > p_until;
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
revoke execute on function public.generate_series_month(uuid, date, date) from public, anon;
grant execute on function public.generate_series_month(uuid, date, date) to authenticated, service_role;

create or replace function public.generate_series_dates(p_series uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare s public.series%rowtype; last_day date; m date; total integer := 0; tz text;
begin
  select * into s from public.series where id = p_series;
  -- Signed in: the Iris Supervisor or an admin. No one signed in: the
  -- system itself (a season's trigger, the backfill below, the server); anon
  -- can't call these at all (grants below).
  if not found or ((select auth.uid()) is not null and not public.can_schedule(s.residency_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id where l.id = s.default_location_id;
  last_day := coalesce(s.active_until,
    (select max(se.ends_on) from public.season se where se.residency_id = s.residency_id and se.ends_on >= s.active_from));
  if last_day is null then return 0; end if;
  for m in select g::date from generate_series(
             greatest(date_trunc('month', s.active_from), date_trunc('month', now() at time zone coalesce(tz, 'America/New_York'))),
             last_day, interval '1 month') g loop
    total := total + public.generate_series_month(s.id, m, last_day);
  end loop;
  return total;
end;
$$;
revoke execute on function public.generate_series_dates(uuid) from public, anon;
grant execute on function public.generate_series_dates(uuid) to authenticated, service_role;

create or replace function public.season_fills_dates()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid;
begin
  if (select auth.uid()) is not null and not public.can_schedule(new.residency_id) then
    return null;
  end if;
  for sid in select sr.id from public.series sr
              where sr.residency_id = new.residency_id
                and sr.active_from <= new.ends_on
                and (sr.active_until is null or sr.active_until >= new.starts_on) loop
    perform public.generate_series_dates(sid);
  end loop;
  return null;
end;
$$;
revoke execute on function public.season_fills_dates() from public, anon, authenticated;
drop trigger if exists season_fills_dates on public.season;
create trigger season_fills_dates after insert or update of starts_on, ends_on on public.season
  for each row execute function public.season_fills_dates();

-- Backfill: weekly programs at active programs that still run.
do $$
declare sid uuid;
begin
  for sid in select sr.id from public.series sr join public.residency r on r.id = sr.residency_id
              where r.status = 'active' and (sr.active_until is null or sr.active_until >= current_date) loop
    perform public.generate_series_dates(sid);
  end loop;
end;
$$;
