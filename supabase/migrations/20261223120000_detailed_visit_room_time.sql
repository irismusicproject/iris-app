-- Detailed one-to-one notes: residents' rooms, time of day, and a required
-- write-up (DOMAIN-MODEL v0.36; Lauren, Nov 22, 2026).
--
-- At a building with detailed notes switched on (site.detailed_relationship_notes):
--   - every relationship-building log needs a note for the partner and the
--     start and end time of the visit (e.g. 12:45 pm - 1:15 pm); minutes are
--     worked out from the times, so pay and billing use the same length;
--   - each resident has a room on their record (resident.room), filled in
--     when they're picked and updated by the musician if they've moved;
--     every resident on a log needs one. The log keeps the room as it was
--     that day (relationship_activity_resident.room), so old documents stay
--     right after a move.
-- Rooms are kept only at detailed-notes buildings; partners there are
-- comfortable with it (Lauren, Nov 22, 2026). Never health information.
-- Other buildings are unchanged. Only new or changed logs are checked.
-- Seeds and repairs run without a signed-in user and aren't affected.
--
-- Additive only: new nullable columns, a function and triggers. The phone app
-- doesn't log relationship building.

-- Time of the visit ----------------------------------------------------------------
alter table public.relationship_activity
  add column start_time time,
  add column end_time time,
  add constraint relationship_activity_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time));
comment on column public.relationship_activity.start_time is 'Detailed-notes sites (v0.36): start of the visit, site time. Minutes = end - start.';
comment on column public.relationship_activity.end_time is 'Detailed-notes sites (v0.36): end of the visit, site time.';

-- Musicians may not be able to read the site row, so these run as definer.
create function public.site_has_detailed_notes(p_site uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select detailed_relationship_notes from public.site where id = p_site), false) $$;
revoke all on function public.site_has_detailed_notes(uuid) from public, anon;
grant execute on function public.site_has_detailed_notes(uuid) to authenticated;

create function public.relationship_detailed_visit_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.site_has_detailed_notes(new.site_id) then
    return new;
  end if;
  if (select auth.uid()) is null then
    if new.start_time is not null then
      new.minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::integer;
    end if;
    return new;
  end if;
  if new.note is null or length(btrim(new.note)) = 0 then
    raise exception 'write a note for the partner: this building gets detailed notes' using errcode = '23514';
  end if;
  if new.start_time is null or new.end_time is null then
    raise exception 'enter the start and end time of the visit' using errcode = '23514';
  end if;
  -- Minutes come from the times (the table check already makes end > start).
  new.minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::integer;
  return new;
end;
$$;
revoke all on function public.relationship_detailed_visit_guard() from public, anon, authenticated;
create trigger relationship_detailed_visit_guard
  before insert or update of note, site_id, start_time, end_time, minutes on public.relationship_activity
  for each row execute function public.relationship_detailed_visit_guard();

-- Residents' rooms --------------------------------------------------------------------
alter table public.resident
  add column room text check (room is null or length(btrim(room)) between 1 and 30);
comment on column public.resident.room is
  'Room number, at detailed-notes sites only (v0.36). Filled in when logging; never health information.';

alter table public.relationship_activity_resident
  add column room text check (room is null or length(btrim(room)) between 1 and 30);
comment on column public.relationship_activity_resident.room is
  'The resident''s room on the day of the visit (detailed-notes sites, v0.36).';

-- Rooms only at detailed-notes buildings.
create function public.resident_room_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.room is not null and not public.site_has_detailed_notes(new.site_id) then
    raise exception 'rooms are kept only at buildings with detailed notes' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.resident_room_guard() from public, anon, authenticated;
create trigger resident_room_guard before insert or update of room, site_id on public.resident
  for each row execute function public.resident_room_guard();

-- A musician sets or updates a resident's room while logging (they can add
-- residents but not edit them otherwise). Same people who can add residents
-- at that site; admins too.
create function public.set_resident_room(p_resident uuid, p_room text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.resident; v text := nullif(btrim(p_room), '');
begin
  select * into r from public.resident where id = p_resident;
  if not found or not (public.is_admin() or public.can_add_site_residents(r.site_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v is not distinct from r.room then return; end if;
  update public.resident set room = v where id = p_resident;
  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values ((select auth.uid()), 'resident', r.id, 'update', jsonb_build_object('room', r.room), jsonb_build_object('room', v));
end;
$$;
revoke all on function public.set_resident_room(uuid, text) from public, anon;
grant execute on function public.set_resident_room(uuid, text) to authenticated;

-- Each resident on a log at a detailed-notes building keeps that day's room.
create function public.activity_resident_room_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare site uuid; res public.resident;
begin
  select site_id into site from public.relationship_activity where id = new.activity_id;
  if not public.site_has_detailed_notes(site) then
    new.room := null;
    return new;
  end if;
  select * into res from public.resident where id = new.resident_id;
  new.room := coalesce(nullif(btrim(new.room), ''), res.room);
  if new.room is null and (select auth.uid()) is not null then
    raise exception 'enter %''s room', res.display_name using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.activity_resident_room_guard() from public, anon, authenticated;
create trigger activity_resident_room_guard before insert on public.relationship_activity_resident
  for each row execute function public.activity_resident_room_guard();
