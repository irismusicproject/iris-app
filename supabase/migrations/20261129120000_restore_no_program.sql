-- "No Program" dates can be restored (DOMAIN-MODEL v0.17, decided by Lauren
-- Nov 22, 2026): calendars take back-and-forth, e.g. a musician marks a date
-- "No Program", then the point person asks for a sub instead. Schedulers
-- (Admin Lead, point person, admins) restore it; it comes back as a draft
-- with its musicians and leader, and is published with the month or the
-- next calendar version. Replaces session_guard() (from
-- 20261126120000_musicians_edit_notes.sql); only the canceled rule changes.

create or replace function public.session_guard()
returns trigger language plpgsql set search_path = ''
as $$
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
    -- Roster musicians (not schedulers) may change only the title and room
    -- of a draft, plus date and time for special events (v0.12).
    if (select auth.uid()) is not null and not public.can_schedule(old.residency_id) then
      if old.schedule_state <> 'draft'
         or new.schedule_state is distinct from old.schedule_state
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
    -- Publishing happens through publish_month(), which checks review and leaders.
    if old.schedule_state = 'draft' and new.schedule_state = 'published'
       and coalesce(current_setting('iris.publishing', true), '') <> 'on' then
      raise exception 'publish a month with publish_month()' using errcode = '42501';
    end if;
    -- A "No Program" date can be restored, back to a draft only (v0.17).
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
    -- New sessions start as drafts; they're published with their month.
    raise exception 'new sessions start as drafts' using errcode = '42501';
  end if;
  if new.schedule_state = 'canceled' and new.canceled_at is null then
    new.canceled_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
