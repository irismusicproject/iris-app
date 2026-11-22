-- Two fixes found while bringing the scheduling tests up to v0.18 (Ryan's
-- side, Nov 22, 2026). Nothing is removed or renamed.
--
-- 1. The Admin Lead couldn't publish. publish_month() runs with the caller's
--    identity, so session_guard() treated the Admin Lead as a musician and
--    refused the draft -> published change. The guard now lets the change
--    through while a publishing function has switched on "iris.publishing"
--    (set only inside publish_month() and new_calendar_version(); it isn't
--    reachable through the API).
-- 2. Schema review F1: new_calendar_version() published new group sessions
--    without the one-leader check that publish_month() has. It now refuses,
--    with the same message.

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
    planner := (select auth.uid()) is null or public.can_schedule(old.residency_id)
               or coalesce(current_setting('iris.publishing', true), '') = 'on';
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
      -- time only for special events. The date's leader can also make it
      -- "No Program" (draft -> canceled, with a reason).
      if (new.schedule_state is distinct from old.schedule_state
          and not (old.schedule_state = 'draft' and new.schedule_state = 'canceled'
                   and public.is_session_leader(old.id)))
         or new.series_id is distinct from old.series_id
         or new.kind is distinct from old.kind
         or new.has_set_time is distinct from old.has_set_time
         or new.is_special_event is distinct from old.is_special_event
         or new.is_extra is distinct from old.is_extra
         or new.billable is distinct from old.billable
         or (new.cancellation_reason is distinct from old.cancellation_reason and new.schedule_state <> 'canceled')
         or new.public_note is distinct from old.public_note
         or (not old.is_special_event and (
               new.starts_at is distinct from old.starts_at
               or new.scheduled_minutes is distinct from old.scheduled_minutes
               or new.call_time is distinct from old.call_time)) then
        raise exception 'musicians can change a draft''s title, room and notes (and a special event''s date and time); its leader can make it No Program'
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
   where se.schedule_state = 'draft' and se.kind = 'group_session'
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

