-- Approved weeks are final (DOMAIN-MODEL v0.29; decided by Ryan, Nov 22,
-- 2026; M-Q2 in issue #30).
--
-- 1. Once the point person approves a musician's week, that week's
--    documentation can't be edited, added to or removed, except by an admin
--    (every change is logged, as before). Covered:
--      - relationship-building logs (and who shares them) in an approved week
--        of anyone credited with them;
--      - session reports of programs anyone with an approved week played;
--      - who played those programs, and their date, room, billable flag,
--        length and "No Program" state (titles and notes stay editable).
--    A program's length is final once the first approved week includes it.
-- 2. A week is approved only when it's complete: approve_week() waits while a
--    program the musician played that week has no report yet.
--
-- Seeds and repairs run without a signed-in user and aren't affected.

-- Helpers ---------------------------------------------------------------------
create function public.week_monday(p_day date)
returns date language sql immutable set search_path = ''
as $$ select p_day - (extract(isodow from p_day)::int - 1) $$;

create function public.is_week_approved(p_person uuid, p_residency uuid, p_day date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.time_entry te
                 where te.person_id = p_person and te.residency_id = p_residency
                   and te.week_starting = public.week_monday(p_day) and te.state = 'approved');
$$;
revoke all on function public.is_week_approved(uuid, uuid, date) from public, anon;
grant execute on function public.is_week_approved(uuid, uuid, date) to authenticated;

-- Anyone on the session (whatever their status) has an approved week covering it.
create function public.is_session_in_approved_week(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session se
    join public.session_assignment sa on sa.session_id = se.id
    where se.id = p_session
      and public.is_week_approved(sa.person_id, se.residency_id, public.session_local_date(se.id)));
$$;
revoke all on function public.is_session_in_approved_week(uuid) from public, anon;
grant execute on function public.is_session_in_approved_week(uuid) to authenticated;

-- The logger or anyone it's shared with has an approved week covering it.
create function public.is_activity_in_approved_week(p_activity uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.relationship_activity ra
    where ra.id = p_activity
      and (public.is_week_approved(ra.person_id, ra.residency_id, ra.occurred_on)
           or exists (select 1 from public.relationship_activity_musician m
                      where m.activity_id = ra.id
                        and public.is_week_approved(m.person_id, ra.residency_id, ra.occurred_on))));
$$;
revoke all on function public.is_activity_in_approved_week(uuid) from public, anon;
grant execute on function public.is_activity_in_approved_week(uuid) to authenticated;

-- True when the signed-in person may change approved work: admins only.
-- Nobody signed in (seeds, repairs) is never stopped.
create function public.may_change_approved()
returns boolean language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is null or public.is_admin() $$;
revoke all on function public.may_change_approved() from public, anon;
grant execute on function public.may_change_approved() to authenticated;

-- 1a. Relationship-building logs -----------------------------------------------
create function public.relationship_activity_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if public.may_change_approved() then return coalesce(new, old); end if;
  if tg_op in ('UPDATE', 'DELETE') and public.is_activity_in_approved_week(old.id) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (
       public.is_week_approved(new.person_id, new.residency_id, new.occurred_on)
       or (tg_op = 'UPDATE' and exists (
             select 1 from public.relationship_activity_musician m
             where m.activity_id = new.id
               and public.is_week_approved(m.person_id, new.residency_id, new.occurred_on)))) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.relationship_activity_approved_guard() from public, anon, authenticated;
create trigger relationship_activity_approved before insert or update or delete on public.relationship_activity
  for each row execute function public.relationship_activity_approved_guard();

create function public.relationship_activity_musician_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r public.relationship_activity_musician := coalesce(new, old);
  a public.relationship_activity;
begin
  if public.may_change_approved() then return r; end if;
  select * into a from public.relationship_activity where id = r.activity_id;
  if a.id is null then return r; end if; -- the log itself is being removed (its own guard ran)
  if public.is_activity_in_approved_week(a.id)
     or public.is_week_approved(r.person_id, a.residency_id, a.occurred_on) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  return r;
end;
$$;
revoke all on function public.relationship_activity_musician_approved_guard() from public, anon, authenticated;
create trigger relationship_activity_musician_approved before insert or delete on public.relationship_activity_musician
  for each row execute function public.relationship_activity_musician_approved_guard();

-- 1b. Session reports ------------------------------------------------------------
create function public.session_report_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if public.may_change_approved() then return coalesce(new, old); end if;
  if public.is_session_in_approved_week(coalesce(new.session_id, old.session_id))
     or (tg_op = 'UPDATE' and public.is_session_in_approved_week(old.session_id)) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.session_report_approved_guard() from public, anon, authenticated;
create trigger session_report_approved before insert or update or delete on public.session_report
  for each row execute function public.session_report_approved_guard();

-- 1c. Who played, and the fields that set pay and billing -----------------------
create function public.session_assignment_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid := coalesce(new.session_id, old.session_id);
begin
  if public.may_change_approved() then return coalesce(new, old); end if;
  if public.is_session_in_approved_week(sid)
     or (tg_op in ('INSERT', 'UPDATE') and exists (
           select 1 from public.session se where se.id = sid
             and public.is_week_approved(new.person_id, se.residency_id, public.session_local_date(se.id)))) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.session_assignment_approved_guard() from public, anon, authenticated;
create trigger session_assignment_approved before insert or update or delete on public.session_assignment
  for each row execute function public.session_assignment_approved_guard();

create function public.session_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if public.may_change_approved() then return new; end if;
  if (new.starts_at, new.location_id, new.billable, new.scheduled_minutes, new.kind, new.is_special_event, new.residency_id)
       is distinct from
     (old.starts_at, old.location_id, old.billable, old.scheduled_minutes, old.kind, old.is_special_event, old.residency_id)
     or (new.schedule_state is distinct from old.schedule_state
         and not (old.schedule_state = 'draft' and new.schedule_state = 'published')) then
    if public.is_session_in_approved_week(old.id) then
      raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.session_approved_guard() from public, anon, authenticated;
-- Named to run before the other session triggers (they fire in name order).
create trigger session_aa_approved_guard before update on public.session
  for each row execute function public.session_approved_guard();

-- Moving a date INTO an approved week is caught after the move, when the new
-- date is known (same pattern as session_date_roster_guard).
create function public.session_moved_into_approved_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.may_change_approved() and public.is_session_in_approved_week(new.id) then
    raise exception 'this week has been approved and can no longer be edited' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.session_moved_into_approved_guard() from public, anon, authenticated;
create trigger session_moved_into_approved after update of starts_at on public.session
  for each row when (new.starts_at is distinct from old.starts_at)
  execute function public.session_moved_into_approved_guard();

-- 2. Approval waits for the week's documentation --------------------------------
-- Past, non-canceled programs a musician played (not absent) that week with no report.
create function public.undocumented_played_sessions(p_person uuid, p_residency uuid, p_week date)
returns table (session_id uuid, leader_name text)
language sql stable security definer set search_path = ''
as $$
  select se.id,
         (select p.name from public.session_assignment l join public.person p on p.id = l.person_id
           where l.session_id = se.id and l.role = 'leader' and l.status <> 'absent' limit 1)
  from public.session se
  join public.session_assignment a on a.session_id = se.id and a.person_id = p_person and a.status <> 'absent'
  join public.location loc on loc.id = se.location_id
  join public.site st on st.id = loc.site_id
  where se.residency_id = p_residency and se.kind = 'group_session' and se.schedule_state <> 'canceled'
    and se.starts_at <= now()
    and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
    and not exists (select 1 from public.session_report r where r.session_id = se.id)
    and (public.is_admin() or public.is_current_staff(p_residency, 'point_person')
         or (p_person = (select auth.uid()) and public.is_active_person()));
$$;
revoke all on function public.undocumented_played_sessions(uuid, uuid, date) from public, anon;
grant execute on function public.undocumented_played_sessions(uuid, uuid, date) to authenticated;

create or replace function public.approve_week(p_person uuid, p_residency uuid, p_week date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer; waiting text;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the point person or an admin approves hours' using errcode = '42501';
  end if;
  select string_agg(distinct coalesce(u.leader_name, 'its leader'), ', ') into waiting
    from public.undocumented_played_sessions(p_person, p_residency, p_week) u;
  if waiting is not null then
    raise exception 'a program from this week is waiting for documentation from %', waiting using errcode = '23514';
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
