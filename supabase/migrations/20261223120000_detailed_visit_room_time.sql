-- Detailed one-to-one notes: room and time of day, and a required write-up
-- (DOMAIN-MODEL v0.36; Lauren, Nov 22, 2026).
--
-- At a building with detailed notes switched on (site.detailed_relationship_notes),
-- every relationship-building log needs:
--   - a note for the partner (no longer optional),
--   - the room where it happened, typed (e.g. "312" or "Library"),
--   - the start and end time (e.g. 12:45 pm - 1:15 pm); minutes are worked
--     out from them, so pay and billing use the same length.
-- Other buildings are unchanged: minutes typed, note optional, no room or times.
-- Only new or changed logs are checked; older logs keep what they have.
--
-- Additive only: three new nullable columns and a trigger. The phone app
-- doesn't log relationship building.

alter table public.relationship_activity
  add column visit_room text check (visit_room is null or length(btrim(visit_room)) between 1 and 60),
  add column start_time time,
  add column end_time time,
  add constraint relationship_activity_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time));
comment on column public.relationship_activity.visit_room is
  'Where the visit happened, typed (e.g. "312", "Library"). Detailed-notes sites (v0.36). Not the resident''s record; no health information.';
comment on column public.relationship_activity.start_time is 'Detailed-notes sites (v0.36): start of the visit, site time. Minutes = end - start.';
comment on column public.relationship_activity.end_time is 'Detailed-notes sites (v0.36): end of the visit, site time.';

-- Musicians may not be able to read the site row, so this runs as definer.
create function public.relationship_detailed_visit_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce((select s.detailed_relationship_notes from public.site s where s.id = new.site_id), false) then
    return new;
  end if;
  if new.note is null or length(btrim(new.note)) = 0 then
    raise exception 'write a note for the partner: this building gets detailed notes' using errcode = '23514';
  end if;
  if new.visit_room is null then
    raise exception 'enter the room where the visit happened' using errcode = '23514';
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
  before insert or update of note, site_id, visit_room, start_time, end_time, minutes on public.relationship_activity
  for each row execute function public.relationship_detailed_visit_guard();
