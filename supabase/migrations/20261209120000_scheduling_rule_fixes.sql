-- Fixes for four scheduling rule gaps found by the overnight database tests
-- (PR #48, Ryan's side, Nov 22, 2026). Each follows a rule DOMAIN-MODEL
-- already states; nothing is removed.
--   K1  Usual musicians must be on the residency's current roster
--       (Series.default_personnel: "Must be on the current roster").
--   K3  Session.canceled_at is recorded by the database, not typed in
--       ("When the cancellation was recorded"; late cancellations bill
--       differently, D9).
--   K4  An updated calendar can't go out while any non-canceled group
--       session that month lacks exactly one leader (Session invariant;
--       extends the 20261207 fix from new drafts to published dates).
--   K5  Moving a date keeps everyone who plays it on a roster covering the
--       new date (D16; the check used to run only when an assignment was added).
-- Not here: K2 (filling a whole season creates dates outside the season)
-- needs month filling to know the season's bounds; left for a decision.

-- K1 ---------------------------------------------------------------------------
create function public.series_default_person_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.series se
    join public.season s on s.residency_id = se.residency_id
    join public.roster_member rm on rm.season_id = s.id
    join public.person p on p.id = rm.person_id
    where se.id = new.series_id and rm.person_id = new.person_id and p.active
      and s.ends_on >= current_date
      and (rm.left_on is null or rm.left_on >= current_date)
  ) then
    raise exception 'usual musicians must be on the current roster' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger series_default_person_guard before insert or update on public.series_default_person
  for each row execute function public.series_default_person_guard();

-- K3 ---------------------------------------------------------------------------
-- Runs before session_guard (triggers fire in name order). Seeds and repairs
-- run without a signed-in user and keep their values.
create function public.session_canceled_at_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.schedule_state = 'canceled' then
    if old.schedule_state is distinct from 'canceled' then
      new.canceled_at := now();
    else
      new.canceled_at := old.canceled_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger session_canceled_at_guard before update on public.session
  for each row execute function public.session_canceled_at_guard();

-- K5 ---------------------------------------------------------------------------
create function public.session_date_roster_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d date := public.session_local_date(new.id);
begin
  if exists (
    select 1 from public.session_assignment sa
    where sa.session_id = new.id and sa.status <> 'absent'
      and not exists (
        select 1 from public.roster_member rm
        join public.season s on s.id = rm.season_id
        where s.residency_id = new.residency_id and rm.person_id = sa.person_id
          and d between s.starts_on and s.ends_on
          and (rm.left_on is null or rm.left_on >= d))
  ) then
    raise exception 'someone playing this date isn''t on the roster for the new date' using errcode = '23514';
  end if;
  return null;
end;
$$;
create trigger session_date_roster_guard after update of starts_at on public.session
  for each row when (new.starts_at is distinct from old.starts_at)
  execute function public.session_date_roster_guard();

-- K4 ---------------------------------------------------------------------------
create or replace function public.new_calendar_version(p_residency uuid, p_site uuid, p_month date, p_partner_feedback text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; last_v integer; v_id uuid; missing integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select max(version) into last_v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent';
  if last_v is null then
    raise exception 'publish version 1 first' using errcode = '23514';
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
  insert into public.calendar_export (residency_id, site_id, month, version, state,
                                      generated_by, generated_at, sent_at, partner_feedback)
  values (p_residency, p_site, m, last_v + 1, 'sent', (select auth.uid()), now(), now(), p_partner_feedback)
  returning calendar_export.id into v_id;
  return v_id;
end;
$$;
