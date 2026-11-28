-- D20 part 2 (Ryan, Nov 27, 2026; D19-h):
-- 1. A building's month opens for the team by itself as soon as its first
--    date exists (no "Open [month]" button or task). Only this month and
--    later months open. The "open for the team" email goes out from the
--    scheduled run (queue_month_opened) once the month is this month or next,
--    so filling a whole season doesn't send a pile of emails, and musicians
--    added after the first date still get it.
-- 2. Saving a weekly or monthly program creates its draft dates from its
--    start (or this month, if that's later) to its Ends date, or to the end
--    of its season when Ends is blank. "Fill the whole season" goes away.
-- open_schedule_month stays for older phones.

create or replace function public.ensure_schedule_month(p_residency uuid, p_site uuid, p_month date, p_notify boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; s record; label text; rname text; due date; by_when text;
begin
  select st.id, st.display_name, st.timezone into s from public.site st where st.id = p_site;
  if not found then return false; end if;
  insert into public.schedule_month (residency_id, site_id, month, team_due_on, final_due_on, opened_by)
  values (p_residency, p_site, m,
          public.schedule_due_on(m, 'schedule_internal_due_day', 10),
          public.schedule_due_on(m, 'schedule_partner_due_day', 15),
          (select auth.uid()))
  on conflict (residency_id, site_id, month) do nothing;
  if not found then return false; end if;
  if p_notify then
    select name into rname from public.residency where id = p_residency;
    label := to_char(m, 'FMMonth YYYY');
    due := public.schedule_due_on(m, 'schedule_internal_due_day', 10);
    by_when := case when due < (now() at time zone coalesce(s.timezone, 'America/New_York'))::date
                    then 'As soon as possible'
                    else 'By ' || to_char(due, 'FMDay, FMMonth FMDD') end;
    insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
    select 'month_opened', p.id, p.email,
           label || ' at ' || s.display_name || ' is open for the team',
           label || ' at ' || s.display_name || ' (' || rname || ') is open. ' || by_when || ':' || chr(10) ||
           '- add a title to each date you lead;' || chr(10) ||
           '- mark any date you can''t play (on the date, in the calendar);' || chr(10) ||
           '- propose a leader swap if you need one.',
           'month_opened:' || p_residency || ':' || p_site || ':' || m || ':' || p.id
    from public.month_players(p_residency, p_site, m) mp join public.person p on p.id = mp and p.active
    on conflict (dedupe_key) do nothing;
  end if;
  return true;
end;
$$;
revoke execute on function public.ensure_schedule_month(uuid, uuid, date, boolean) from public, anon, authenticated;

create or replace function public.open_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare opened integer := 0; s record;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the Iris Supervisor or an admin can open a month' using errcode = '42501';
  end if;
  if p_site is not null and not exists (select 1 from public.residency_site where residency_id = p_residency and site_id = p_site) then
    raise exception 'that site isn''t part of this residency' using errcode = '23514';
  end if;
  for s in select rs.site_id from public.residency_site rs
            where rs.residency_id = p_residency and (p_site is null or rs.site_id = p_site) loop
    if public.ensure_schedule_month(p_residency, s.site_id, p_month, true) then opened := opened + 1; end if;
  end loop;
  return opened;
end;
$$;

-- Runs at the end of the transaction, so the date's musicians are already on
-- it when the email goes out.
create or replace function public.session_opens_month()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare st record; m date; this_month date;
begin
  select s.id, s.timezone into st from public.location l join public.site s on s.id = l.site_id where l.id = new.location_id;
  if not found or not exists (select 1 from public.session where id = new.id) then return null; end if;
  m := date_trunc('month', new.starts_at at time zone st.timezone)::date;
  this_month := date_trunc('month', now() at time zone st.timezone)::date;
  if m < this_month then return null; end if;
  -- The email goes out from queue_month_opened (every scheduled run), once
  -- the month's musicians are on it.
  perform public.ensure_schedule_month(new.residency_id, st.id, m, false);
  return null;
end;
$$;
revoke execute on function public.session_opens_month() from public, anon, authenticated;

drop trigger if exists session_opens_month on public.session;
create constraint trigger session_opens_month after insert on public.session
  deferrable initially deferred for each row execute function public.session_opens_month();

-- generate_series_month gains an optional last day (the season's end for a
-- program with no Ends date). Same results when it isn't given.
drop function public.generate_series_month(uuid, date);
create function public.generate_series_month(p_series uuid, p_month date, p_until date default null)
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

create or replace function public.generate_series_dates(p_series uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare s public.series%rowtype; last_day date; m date; total integer := 0; tz text;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
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
grant execute on function public.generate_series_dates(uuid) to authenticated;


-- The "open for the team" email: from the 1st of the month before (D19-h),
-- once per musician playing, from the same scheduled run as the reminders.
create or replace function public.queue_month_opened(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; c integer; sm record; label text; by_when text; today date;
begin
  for sm in select m.*, st.display_name, st.timezone, r.name as rname
              from public.schedule_month m join public.site st on st.id = m.site_id join public.residency r on r.id = m.residency_id
             where m.stage = 'team_editing' loop
    today := (p_now at time zone coalesce(sm.timezone, 'America/New_York'))::date;
    continue when sm.month > (date_trunc('month', today) + interval '1 month')::date or sm.month < date_trunc('month', today)::date;
    label := to_char(sm.month, 'FMMonth YYYY');
    by_when := case when sm.team_due_on < today then 'As soon as possible'
                    else 'By ' || to_char(sm.team_due_on, 'FMDay, FMMonth FMDD') end;
    insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
    select 'month_opened', p.id, p.email,
           label || ' at ' || sm.display_name || ' is open for the team',
           label || ' at ' || sm.display_name || ' (' || sm.rname || ') is open. ' || by_when || ':' || chr(10) ||
           '- add a title to each date you lead;' || chr(10) ||
           '- mark any date you can''t play (on the date, in the calendar);' || chr(10) ||
           '- propose a leader swap if you need one.',
           'month_opened:' || sm.residency_id || ':' || sm.site_id || ':' || sm.month || ':' || p.id
    from public.month_players(sm.residency_id, sm.site_id, sm.month) mp join public.person p on p.id = mp and p.active
    on conflict (dedupe_key) do nothing;
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end;
$$;
revoke execute on function public.queue_month_opened(timestamptz) from public, anon, authenticated;

-- To do: no "Open [month] for the team" any more (months open themselves).
create or replace function public.my_tasks()
returns table (kind text, title text, detail text, due_on date, residency_id uuid, site_id uuid, month date,
               session_id uuid, request_id uuid)
language sql stable security definer set search_path = ''
as $$
  with me as (select p.id from public.person p where p.id = (select auth.uid()) and p.active),
  pp as (select sa.residency_id from public.staff_assignment sa, me
          where sa.person_id = me.id and sa.role = 'point_person'
            and sa.starts_on <= (now() at time zone 'America/New_York')::date and (sa.ends_on is null or sa.ends_on >= (now() at time zone 'America/New_York')::date)),
  al as (select distinct s.residency_id from public.roster_member rm join public.season s on s.id = rm.season_id, me
          where rm.person_id = me.id and rm.is_admin_lead and s.ends_on >= (now() at time zone 'America/New_York')::date
            and (rm.left_on is null or rm.left_on >= (now() at time zone 'America/New_York')::date)),
  months as (select sm.*, st.display_name as site_name, r.name as residency_name, to_char(sm.month, 'FMMonth') as month_name
               from public.schedule_month sm join public.site st on st.id = sm.site_id join public.residency r on r.id = sm.residency_id
              where sm.month >= date_trunc('month', (now() at time zone 'America/New_York')::date)::date),
  mine as (select se.id, se.residency_id, se.title, se.series_id, se.starts_at, se.kind, se.schedule_state,
                  st.id as site_id, st.timezone, a.role, a.status
             from public.session_assignment a join me on me.id = a.person_id
             join public.session se on se.id = a.session_id
             join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id)
  -- Leaders: titles while the team edits
  select 'titles', 'Add titles to the ' || m.month_name || ' dates you lead',
         m.site_name || ': ' || count(*) || ' still ' || case when count(*) = 1 then 'has' else 'have' end || ' the usual title',
         m.team_due_on, m.residency_id, m.site_id, m.month, null::uuid, null::uuid
    from months m join mine x on x.residency_id = m.residency_id and x.site_id = m.site_id
     and date_trunc('month', x.starts_at at time zone x.timezone)::date = m.month
    join public.series sr on sr.id = x.series_id
   where m.stage = 'team_editing' and x.role = 'leader' and x.status <> 'absent' and x.schedule_state = 'draft' and x.title = sr.title
   group by m.month_name, m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month
  union all
  -- Point person: review and confirm
  select 'confirm', 'Review and confirm ' || m.month_name, m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join pp on pp.residency_id = m.residency_id where m.stage = 'team_editing'
  union all
  -- Point person: someone can't play a draft date
  select 'cover', p.name || ' can''t play ' || to_char(se.starts_at at time zone st.timezone, 'FMDy FMMon FMDD'),
         se.title || ', ' || st.display_name || '. Find cover, or make it "No Program".',
         m.team_due_on, se.residency_id, st.id, m.month, se.id, null
    from months m join pp on pp.residency_id = m.residency_id
    join public.session se on se.residency_id = m.residency_id and se.schedule_state = 'draft'
    join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id and st.id = m.site_id
    join public.session_assignment a on a.session_id = se.id and a.status = 'absent'
    join public.person p on p.id = a.person_id
   where m.stage in ('team_editing', 'team_confirmed')
     and date_trunc('month', se.starts_at at time zone st.timezone)::date = m.month
     and not exists (select 1 from public.session_assignment s2 where s2.session_id = se.id and s2.substitute_for_id = a.person_id)
  union all
  -- Point person: requests to decide
  select 'approve', case cr.kind when 'leader_swap' then 'Approve leader swap' when 'sub' then 'Approve a sub' else 'Approve a change' end,
         public.session_label(se.id) || ': ' || rq.name ||
         case cr.kind when 'leader_swap' then ' proposes ' || pr.name || ' as leader'
                      when 'sub' then ' asks for ' || pr.name || ' as sub' else ' asks: ' || coalesce(cr.note, '') end,
         (now() at time zone 'America/New_York')::date, se.residency_id, null, null, se.id, cr.id
    from public.change_request cr join public.session se on se.id = cr.session_id
    join pp on pp.residency_id = se.residency_id
    join public.person rq on rq.id = cr.requested_by left join public.person pr on pr.id = cr.proposed_person_id
   where cr.status = 'open'
  union all
  -- Admin Lead: send, enter partner changes, mark final
  select 'send', 'Send ' || m.month_name || ' to the partner', m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('team_editing', 'team_confirmed')
  union all
  select 'partner_changes', 'Enter partner changes for ' || m.month_name, m.site_name, m.final_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('sent_to_partner', 'partner_changes')
  union all
  select 'finalize', 'Mark ' || m.month_name || ' final', m.site_name || ': sends the final calendar and locks it', m.final_due_on,
         m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('sent_to_partner', 'partner_changes')
  union all
  -- Musicians: document programs they led (last four weeks)
  select 'document', 'Document ' || x.title, to_char(x.starts_at at time zone x.timezone, 'FMDay, FMMonth FMDD'),
         public.week_monday((x.starts_at at time zone x.timezone)::date) + 8, x.residency_id, x.site_id, null, x.id, null
    from mine x
   where x.kind = 'group_session' and x.role = 'leader' and x.status <> 'absent' and x.schedule_state <> 'canceled'
     and x.starts_at <= now() and x.starts_at > now() - interval '28 days'
     and not exists (select 1 from public.session_report sr where sr.session_id = x.id)
  union all
  -- Musicians: submit last week
  select 'submit_week', 'Submit your week', r.name || ', week of ' || to_char(public.week_monday((now() at time zone 'America/New_York')::date - 7), 'FMMonth FMDD'),
         public.week_monday((now() at time zone 'America/New_York')::date) + 1, r.id, null, null, null, null
    from public.residency r, me,
         lateral public.missing_work_internal(r.id, public.week_monday((now() at time zone 'America/New_York')::date - 7)) mw
   where mw.person_id = me.id and mw.documented_minutes > 0 and mw.hours_state in ('none', 'draft')
     and public.is_on_current_roster(r.id, me.id)
  order by 4, 2;
$$;
