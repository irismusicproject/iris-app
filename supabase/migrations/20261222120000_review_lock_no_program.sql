-- Draft dates after review, and "No Program" on drafts (DOMAIN-MODEL v0.35;
-- Lauren, Nov 22, 2026).
--
-- 1. Locked after review (decided in v0.25, built now): once the point person
--    marks a building's month reviewed, musicians can't change its draft
--    dates any more (title, notes, room, who plays, leader, "No Program").
--    The point person and admins still can; the Admin Lead publishes.
-- 2. "No Program" on a draft: any musician playing that date (not only its
--    leader), until the month is reviewed. The Admin Lead is treated like any
--    musician here: only dates they play (revises v0.28).
--
-- Seeds and repairs run without a signed-in user and aren't affected.

-- The building's month for this date has been marked reviewed (calendar version 1 exists).
create function public.is_session_month_reviewed(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session se
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    join public.calendar_export ce on ce.residency_id = se.residency_id and ce.site_id = st.id
     and ce.month = date_trunc('month', se.starts_at at time zone st.timezone)::date
    where se.id = p_session);
$$;
revoke all on function public.is_session_month_reviewed(uuid) from public, anon;
grant execute on function public.is_session_month_reviewed(uuid) to authenticated;

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
      -- Locked after review (v0.25): musicians ask the point person.
      if public.is_session_month_reviewed(old.id) then
        raise exception 'this month has been reviewed; ask the point person for changes' using errcode = '42501';
      end if;
      -- Musicians on a draft they play in: title, room and notes; date and
      -- time only for special events; "No Program" (draft -> canceled, with a
      -- reason) on a date they play (v0.35).
      if (new.schedule_state is distinct from old.schedule_state
          and not (old.schedule_state = 'draft' and new.schedule_state = 'canceled'
                   and public.is_playing(old.id)))
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
        raise exception 'musicians can change a draft''s title, room and notes (and a special event''s date and time), or make a date they play No Program'
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

-- Who plays and the leader on a reviewed month's drafts: point person and admins only.
create function public.session_assignment_review_lock()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare se public.session;
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  select * into se from public.session where id = coalesce(new.session_id, old.session_id);
  if se.id is not null and se.schedule_state = 'draft'
     and not public.can_schedule(se.residency_id)
     and public.is_session_month_reviewed(se.id) then
    raise exception 'this month has been reviewed; ask the point person for changes' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.session_assignment_review_lock() from public, anon, authenticated;
create trigger session_assignment_review_lock before insert or update or delete on public.session_assignment
  for each row execute function public.session_assignment_review_lock();
