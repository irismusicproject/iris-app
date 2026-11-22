-- Decided by Lauren, Nov 22, 2026 (DOMAIN-MODEL v0.24). Built on top of
-- 20261208 (Ryan's money rule fixes): every rule below keeps its
-- "active person" checks.
--
-- 1. Shared relationship building: one log, several musicians. The musician
--    who logs it adds the others (relationship_activity_musician). Residents
--    and the note are recorded once; each musician is credited the minutes,
--    paid for them, and the partner is billed per musician.
-- 2. The building a program happened in is confirmed when documenting
--    (session_report.site_id; default = the scheduled room's building).
--    Metrics and community invoices use it.
-- 3. Pay only for documented hours: weekly hours are calculated from
--    documentation (programs played, special events, relationship building),
--    never typed. "Submit my week" = submit_week(); approving refreshes them.
-- 4. Notifications go through one outbox (notification). The point person
--    is told every time a date becomes "No Program". Deadline reminders:
--    the day before, right after the deadline (with a summary to the point
--    person), and a daily nudge until it's done.
-- 5. missing_work(): who still owes documentation or hours for a week.

-- 1 ---------------------------------------------------------------------------
create table public.relationship_activity_musician (
  activity_id uuid not null references public.relationship_activity (id) on delete cascade,
  person_id   uuid not null references public.person (id) on delete restrict,
  primary key (activity_id, person_id)
);
create index relationship_activity_musician_person_idx on public.relationship_activity_musician (person_id);

create function public.is_activity_musician(p_activity uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.relationship_activity_musician m
    where m.activity_id = p_activity and m.person_id = (select auth.uid()));
$$;
revoke all on function public.is_activity_musician(uuid) from public, anon;
grant execute on function public.is_activity_musician(uuid) to authenticated;

create function public.is_activity_logger(p_activity uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.relationship_activity a where a.id = p_activity and a.person_id = (select auth.uid()));
$$;
revoke all on function public.is_activity_logger(uuid) from public, anon;
grant execute on function public.is_activity_logger(uuid) to authenticated;

-- The added musician must be on the activity's program roster, and isn't the logger.
create function public.relationship_activity_musician_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare a public.relationship_activity;
begin
  select * into a from public.relationship_activity where id = new.activity_id;
  if new.person_id = a.person_id then
    raise exception 'the musician who logged it is already credited' using errcode = '23514';
  end if;
  if not public.is_on_current_roster(a.residency_id, new.person_id) then
    raise exception 'add musicians from this program''s roster' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.relationship_activity_musician_guard() from public, anon, authenticated;
create trigger relationship_activity_musician_guard before insert on public.relationship_activity_musician
  for each row execute function public.relationship_activity_musician_guard();

alter table public.relationship_activity_musician enable row level security;
revoke all on public.relationship_activity_musician from anon, authenticated;
grant select, insert, delete on public.relationship_activity_musician to authenticated;
create policy "activity_musician: whoever sees the activity" on public.relationship_activity_musician for select to authenticated
  using (exists (select 1 from public.relationship_activity a where a.id = activity_id));
create policy "activity_musician: the logger adds" on public.relationship_activity_musician for insert to authenticated
  with check ((select public.is_activity_logger(activity_id)) or (select public.is_admin()));
create policy "activity_musician: the logger or themself removes" on public.relationship_activity_musician for delete to authenticated
  using ((select public.is_activity_logger(activity_id)) or (person_id = (select auth.uid()) and (select public.is_active_person()))
         or (select public.is_admin()));

-- Shared musicians read the activity (Ryan's 20261208 rule + "or shared with me").
drop policy "relationship_activity: own, point person, admins read" on public.relationship_activity;
create policy "relationship_activity: own, shared, point person, admins read" on public.relationship_activity for select to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person'))
         or (select public.is_activity_musician(id)));

-- 2 ---------------------------------------------------------------------------
alter table public.session_report add column site_id uuid references public.site (id) on delete restrict;
comment on column public.session_report.site_id is
  'The building the program happened in, confirmed when documenting (v0.24). Empty = the scheduled room''s building.';

create function public.session_report_site_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.site_id is not null and not exists (
    select 1 from public.session se join public.residency_site rs on rs.residency_id = se.residency_id
    where se.id = new.session_id and rs.site_id = new.site_id) then
    raise exception 'pick one of this program''s buildings' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.session_report_site_guard() from public, anon, authenticated;
create trigger session_report_site_guard before insert or update of site_id on public.session_report
  for each row execute function public.session_report_site_guard();

-- 3 ---------------------------------------------------------------------------
-- Documented minutes for one musician, program and week, by pay category.
create function public.documented_minutes(p_person uuid, p_residency uuid, p_week date)
returns table (category text, minutes bigint)
language sql stable security definer set search_path = ''
as $$
  with allowed as (
    select 1 where (p_person = (select auth.uid()) and public.is_active_person())
                or public.is_admin() or public.is_current_staff(p_residency, 'point_person')
  ),
  played as (
    select se.is_special_event, r.actual_minutes
    from public.session se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.person_id = p_person and a.status <> 'absent'
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
      and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
  ),
  rb as (
    select ra.minutes from public.relationship_activity ra
    where ra.residency_id = p_residency and ra.occurred_on between p_week and p_week + 6
      and (ra.person_id = p_person
           or exists (select 1 from public.relationship_activity_musician m where m.activity_id = ra.id and m.person_id = p_person))
  )
  select c.category, coalesce(c.minutes, 0)::bigint from (
    select 'Programs' as category, (select sum(actual_minutes) from played where not is_special_event) as minutes
    union all select 'Concerts', (select sum(actual_minutes) from played where is_special_event)
    union all select 'Relationship Building', (select sum(minutes) from rb)
  ) c
  where exists (select 1 from allowed);
$$;
revoke all on function public.documented_minutes(uuid, uuid, date) from public, anon;
grant execute on function public.documented_minutes(uuid, uuid, date) to authenticated;

-- Writes the week's hours from documentation (internal).
create function public.refresh_week_hours(p_person uuid, p_residency uuid, p_week date, p_state public.time_state)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.time_entry (person_id, residency_id, week_starting, time_category_id, hours, source, state, submitted_at, returned_note)
  select p_person, p_residency, p_week, tc.id, round(coalesce(d.minutes, 0) / 60.0, 2), 'prefilled', p_state,
         case when p_state = 'submitted' then now() end, null
  from public.time_category tc
  left join (
    -- Same rules as documented_minutes(), without the caller check (internal).
    select 'Programs' as category, sum(r.actual_minutes) filter (where not se.is_special_event) as minutes
    from public.session se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.person_id = p_person and a.status <> 'absent'
    join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
    where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
      and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
    union all
    select 'Concerts', sum(r.actual_minutes) filter (where se.is_special_event)
    from public.session se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.person_id = p_person and a.status <> 'absent'
    join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
    where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
      and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
    union all
    select 'Relationship Building', sum(ra.minutes)
    from public.relationship_activity ra
    where ra.residency_id = p_residency and ra.occurred_on between p_week and p_week + 6
      and (ra.person_id = p_person
           or exists (select 1 from public.relationship_activity_musician m where m.activity_id = ra.id and m.person_id = p_person))
  ) d on d.category = tc.name
  where tc.active
  on conflict (person_id, residency_id, week_starting, time_category_id) do update
    set hours = excluded.hours, source = 'prefilled', state = excluded.state,
        -- Keep the original submission time (on-time metric) when refreshing a submitted week.
        submitted_at = case when public.time_entry.state = 'submitted' then public.time_entry.submitted_at else excluded.submitted_at end,
        returned_note = null
    where public.time_entry.state <> 'approved';
end;
$$;
revoke all on function public.refresh_week_hours(uuid, uuid, date, public.time_state) from public, anon, authenticated;

-- "Submit my week": calculated hours, submitted together. Refused while a
-- program the musician led that week is undocumented.
create function public.submit_week(p_residency uuid, p_week date)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if extract(isodow from p_week) <> 1 then raise exception 'weeks start on Monday' using errcode = '22023'; end if;
  if not (public.is_active_person() and public.is_on_current_roster(p_residency)) then
    raise exception 'only musicians on this program''s roster submit hours here' using errcode = '42501';
  end if;
  if exists (select 1 from public.undocumented_led_sessions(me, p_residency, p_week)) then
    raise exception 'document the programs you led this week before submitting hours' using errcode = '23514';
  end if;
  if exists (select 1 from public.time_entry where person_id = me and residency_id = p_residency and week_starting = p_week and state = 'approved') then
    raise exception 'this week is already approved' using errcode = '42501';
  end if;
  perform public.refresh_week_hours(me, p_residency, p_week, 'submitted');
end;
$$;
revoke all on function public.submit_week(uuid, date) from public, anon;
grant execute on function public.submit_week(uuid, date) to authenticated;

-- Hours are never typed now: musicians no longer insert or update them directly.
drop policy "time_entry: musicians enter their own" on public.time_entry;
drop policy "time_entry: musicians update their own" on public.time_entry;

-- Approving refreshes the hours from documentation first, so pay always
-- matches what's documented at the moment of approval.
create or replace function public.approve_week(p_person uuid, p_residency uuid, p_week date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the point person or an admin approves hours' using errcode = '42501';
  end if;
  if exists (select 1 from public.time_entry where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted') then
    perform public.refresh_week_hours(p_person, p_residency, p_week, 'submitted');
  end if;
  update public.time_entry set state = 'approved', approved_by = (select auth.uid()), approved_at = now(), returned_note = null
   where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Community invoices: shared relationship building bills each musician;
-- programs bill the documented building.
create or replace function public.partner_billable_minutes(p_agreement uuid, p_from date, p_to date)
returns table (site_id uuid, category text, approved_minutes bigint, waiting_minutes bigint, undocumented bigint)
language sql stable security definer set search_path = ''
as $$
  with pa as (
    select a.* from public.partner_agreement a where a.id = p_agreement and public.is_admin()
  ),
  sites as (
    select pas.site_id, st.timezone from public.partner_agreement_site pas
    join public.site st on st.id = pas.site_id
    where pas.agreement_id = p_agreement
  ),
  sess as (
    select se.*, l.site_id as room_site_id, (se.starts_at at time zone st.timezone) as local_start
    from public.session se
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    join pa on pa.residency_id = se.residency_id
    where se.kind = 'group_session' and se.billable
      and (se.starts_at at time zone st.timezone)::date between p_from and p_to
  ),
  approved_week as (
    select te.person_id, te.week_starting from public.time_entry te
    join pa on pa.residency_id = te.residency_id
    where te.state = 'approved'
    group by te.person_id, te.week_starting
  ),
  program_rows as (
    select coalesce(r.site_id, se.room_site_id) as site_id, r.actual_minutes as minutes,
           exists (select 1 from approved_week w where w.person_id = a.person_id
                   and w.week_starting = se.local_start::date - (extract(isodow from se.local_start)::int - 1)) as approved
    from sess se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
    where se.schedule_state = 'published'
  ),
  rb_people as (
    select ra.id, ra.site_id, ra.minutes, ra.occurred_on, ra.person_id from public.relationship_activity ra
    join pa on pa.residency_id = ra.residency_id
    where ra.occurred_on between p_from and p_to
    union all
    select ra.id, ra.site_id, ra.minutes, ra.occurred_on, m.person_id from public.relationship_activity ra
    join public.relationship_activity_musician m on m.activity_id = ra.id
    join pa on pa.residency_id = ra.residency_id
    where ra.occurred_on between p_from and p_to
  ),
  rb_rows as (
    select p.site_id, p.minutes,
           exists (select 1 from approved_week w where w.person_id = p.person_id
                   and w.week_starting = p.occurred_on - (extract(isodow from p.occurred_on)::int - 1)) as approved
    from rb_people p join sites s on s.site_id = p.site_id
  ),
  late_rows as (
    select se.room_site_id as site_id, coalesce(se.scheduled_minutes, 0) as minutes
    from sess se
    join pa on pa.bill_late_cancellations
    join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
    join sites s on s.site_id = se.room_site_id
    where se.schedule_state = 'canceled' and se.cancellation_reason = 'partner'
      and se.canceled_at is not null
      and (se.canceled_at at time zone s.timezone) >= (se.local_start::date + time '09:00')
  ),
  undoc as (
    select se.room_site_id as site_id, count(*) as n from sess se
    where se.schedule_state = 'published' and se.starts_at <= now()
      and not exists (select 1 from public.session_report r where r.session_id = se.id)
    group by se.room_site_id
  )
  select s.site_id, c.category,
         coalesce(sum(x.minutes) filter (where x.approved), 0)::bigint,
         coalesce(sum(x.minutes) filter (where not x.approved), 0)::bigint,
         case when c.category = 'programs' then coalesce((select n from undoc u where u.site_id = s.site_id), 0) else 0 end::bigint
  from sites s
  cross join (values ('programs'), ('relationship_building'), ('late_cancellations')) c(category)
  left join (
    select site_id, 'programs' as category, minutes, approved from program_rows
    union all select site_id, 'relationship_building', minutes, approved from rb_rows
    union all select site_id, 'late_cancellations', minutes, true from late_rows
  ) x on x.site_id = s.site_id and x.category = c.category
  where exists (select 1 from pa)
  group by s.site_id, c.category;
$$;

-- 5 ---------------------------------------------------------------------------
-- Who on a program still owes documentation or hours for a week. A musician
-- owes hours when they have documented work that week and haven't submitted.
-- Internal: no caller check (used by the reminder scheduler).
create function public.missing_work_internal(p_residency uuid, p_week date)
returns table (person_id uuid, undocumented integer, documented_minutes bigint, hours_state text)
language sql stable security definer set search_path = ''
as $$
  with roster as (
    select distinct rm.person_id from public.roster_member rm
    join public.season s on s.id = rm.season_id
    join public.person p on p.id = rm.person_id and p.active
    where s.residency_id = p_residency and s.starts_on <= p_week + 6 and s.ends_on >= p_week
      and (rm.left_on is null or rm.left_on > p_week)
  ),
  per as (
    select r.person_id,
      (select count(*) from public.session se
         join public.session_assignment a on a.session_id = se.id and a.person_id = r.person_id and a.role = 'leader' and a.status <> 'absent'
         join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
        where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
          and se.starts_at <= now()
          and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
          and not exists (select 1 from public.session_report sr where sr.session_id = se.id))::integer as undocumented,
      (
        coalesce((select sum(sr.actual_minutes) from public.session se
           join public.session_report sr on sr.session_id = se.id
           join public.session_assignment a on a.session_id = se.id and a.person_id = r.person_id and a.status <> 'absent'
           join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
          where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
            and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6), 0)
        + coalesce((select sum(ra.minutes) from public.relationship_activity ra
           where ra.residency_id = p_residency and ra.occurred_on between p_week and p_week + 6
             and (ra.person_id = r.person_id or exists (select 1 from public.relationship_activity_musician m where m.activity_id = ra.id and m.person_id = r.person_id))), 0)
        -- Played but the leader hasn't documented yet: still work to submit.
        + coalesce((select count(*) from public.session se
           join public.session_assignment a on a.session_id = se.id and a.person_id = r.person_id and a.status <> 'absent'
           join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
          where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
            and se.starts_at <= now()
            and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
            and not exists (select 1 from public.session_report sr where sr.session_id = se.id)), 0)
      )::bigint as documented_minutes,
      coalesce((select case when bool_or(te.state = 'approved') then 'approved' when bool_or(te.state = 'submitted') then 'submitted' else 'draft' end
                from public.time_entry te where te.person_id = r.person_id and te.residency_id = p_residency and te.week_starting = p_week), 'none') as hours_state
    from roster r
  )
  select per.person_id, per.undocumented, per.documented_minutes, per.hours_state from per
  where per.undocumented > 0 or (per.documented_minutes > 0 and per.hours_state in ('none', 'draft'));
$$;
revoke all on function public.missing_work_internal(uuid, date) from public, anon, authenticated;

-- For the point person and admins (the Follow-up page).
create function public.missing_work(p_residency uuid, p_week date)
returns table (person_id uuid, undocumented integer, documented_minutes bigint, hours_state text)
language sql stable security definer set search_path = ''
as $$
  select * from public.missing_work_internal(p_residency, p_week)
  where public.is_admin() or public.is_current_staff(p_residency, 'point_person');
$$;
revoke all on function public.missing_work(uuid, date) from public, anon;
grant execute on function public.missing_work(uuid, date) to authenticated;

-- 4 ---------------------------------------------------------------------------
create table public.notification (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('no_program', 'deadline_reminder', 'deadline_missed', 'deadline_missed_summary', 'deadline_nudge')),
  person_id   uuid not null references public.person (id) on delete cascade,
  email       text not null,
  subject     text not null check (length(subject) <= 300),
  body        text not null check (length(body) <= 10000),
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  delivery    text check (delivery in ('email', 'outbox_only')),
  error       text
);
create index notification_unsent_idx on public.notification (created_at) where sent_at is null;
alter table public.notification enable row level security;
revoke all on public.notification from anon, authenticated;
grant select on public.notification to authenticated;
create policy "notification: admins read" on public.notification for select to authenticated using ((select public.is_admin()));

-- "No Program": tell the program's point person(s), unless they did it themself.
create function public.notify_no_program()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  tz text;
  who text;
  label text;
begin
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
create trigger notify_no_program after update of schedule_state on public.session
  for each row when (new.schedule_state = 'canceled' and old.schedule_state is distinct from 'canceled')
  execute function public.notify_no_program();

-- Deadline reminders (D7: documentation and hours due Tuesday 5 pm the
-- following week, in the program's time zone). Safe to run as often as
-- every few minutes: each email is queued once (dedupe_key). Run by the
-- scheduler with the service key only.
create function public.queue_deadline_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  m record;
  tz text;
  local_now timestamp;
  this_monday date;
  w date;
  deadline timestamp;
  n integer := 0;
  added integer;
  names text;
  url text := coalesce((select value from public.setting where key = 'site_url'), 'https://app.irismusicproject.org');
begin
  for r in select res.id, res.name from public.residency res where res.status = 'active' loop
    select st.timezone into tz from public.residency_site rs join public.site st on st.id = rs.site_id
     where rs.residency_id = r.id order by st.timezone limit 1;
    tz := coalesce(tz, 'America/New_York');
    local_now := p_now at time zone tz;
    this_monday := local_now::date - (extract(isodow from local_now)::int - 1);

    -- Weeks to look at: last week (deadline this Tuesday) and up to 3 earlier weeks.
    for i in 1..4 loop
      w := this_monday - 7 * i;
      deadline := (w + 8) + time '17:00';

      for m in select mw.person_id, mw.undocumented, p.email, p.name
               from public.missing_work_internal(r.id, w) mw join public.person p on p.id = mw.person_id loop
        if i = 1 and local_now < deadline and extract(isodow from local_now) = 1 and local_now::time >= time '12:00' then
          insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
          values ('deadline_reminder', m.person_id, m.email,
                  'Reminder: documentation and hours due tomorrow at 5 pm',
                  'Hi ' || split_part(m.name, ' ', 1) || ',' || chr(10) || chr(10) ||
                  'Your documentation and hours for ' || r.name || ' (week of ' || to_char(w, 'FMMon FMDD') || ') are due tomorrow, Tuesday, at 5 pm.' ||
                  case when m.undocumented > 0 then chr(10) || m.undocumented || ' program(s) you led still need documenting.' else '' end ||
                  chr(10) || chr(10) || 'My week: ' || url || '/documentation?week=' || w,
                  'reminder:' || m.person_id || ':' || r.id || ':' || w)
          on conflict (dedupe_key) do nothing;
        elsif local_now >= deadline and local_now < deadline + interval '1 day' then
          insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
          values ('deadline_missed', m.person_id, m.email,
                  'Missed deadline: documentation and hours for the week of ' || to_char(w, 'FMMon FMDD'),
                  'Hi ' || split_part(m.name, ' ', 1) || ',' || chr(10) || chr(10) ||
                  'Your documentation and hours for ' || r.name || ' (week of ' || to_char(w, 'FMMon FMDD') || ') were due today at 5 pm and are not in yet.' ||
                  case when m.undocumented > 0 then chr(10) || m.undocumented || ' program(s) you led still need documenting.' else '' end ||
                  chr(10) || 'Please submit them as soon as you can.' || chr(10) || chr(10) || 'My week: ' || url || '/documentation?week=' || w,
                  'missed:' || m.person_id || ':' || r.id || ':' || w)
          on conflict (dedupe_key) do nothing;
        elsif local_now >= deadline + interval '1 day' and local_now::time >= time '08:00' then
          insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
          values ('deadline_nudge', m.person_id, m.email,
                  'Still needed: documentation and hours for the week of ' || to_char(w, 'FMMon FMDD'),
                  'Hi ' || split_part(m.name, ' ', 1) || ',' || chr(10) || chr(10) ||
                  'Your documentation and hours for ' || r.name || ' (week of ' || to_char(w, 'FMMon FMDD') || ') are still missing.' ||
                  chr(10) || chr(10) || 'My week: ' || url || '/documentation?week=' || w,
                  'nudge:' || m.person_id || ':' || r.id || ':' || w || ':' || local_now::date)
          on conflict (dedupe_key) do nothing;
        end if;
        get diagnostics added = row_count;
        n := n + added;
      end loop;

      -- Point person summary, once, right after the deadline.
      if local_now >= deadline and local_now < deadline + interval '1 day' then
        select string_agg(p.name || case when mw.undocumented > 0 then ' (' || mw.undocumented || ' program(s) to document)' else ' (hours)' end, chr(10) order by p.name)
          into names
          from public.missing_work_internal(r.id, w) mw join public.person p on p.id = mw.person_id;
        if names is not null then
          insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
          select 'deadline_missed_summary', p.id, p.email,
                 r.name || ': missing documentation or hours, week of ' || to_char(w, 'FMMon FMDD'),
                 'These musicians haven''t submitted their documentation or hours for the week of ' || to_char(w, 'FMMon FMDD') || ':' || chr(10) || chr(10) ||
                 names || chr(10) || chr(10) || 'Follow-up: ' || url || '/residencies/' || r.id || '/follow-up',
                 'missed-summary:' || p.id || ':' || r.id || ':' || w
          from public.staff_assignment sa join public.person p on p.id = sa.person_id and p.active
          where sa.residency_id = r.id and sa.role = 'point_person'
            and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
          on conflict (dedupe_key) do nothing;
          get diagnostics added = row_count;
          n := n + added;
        end if;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_deadline_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_deadline_reminders(timestamptz) to service_role;
