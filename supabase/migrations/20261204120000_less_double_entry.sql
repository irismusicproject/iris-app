-- Less double entry for musicians (DOMAIN-MODEL v0.21; decided by Lauren
-- Nov 22, 2026).
--
-- 1. Usual type per program: series.default_interaction_type_id pre-selects
--    the type when the leader documents (they can still change it; D2).
-- 2. Usual length per relationship-building type, per program, set by the
--    point person or an admin (activity_length). Pre-fills the log form.
-- 3. Detailed one-to-one notes, switched on per site by an admin
--    (site.detailed_relationship_notes). There, a note can be a paragraph
--    (up to 3000 characters) and a Word document of one day's relationship
--    building can be downloaded for the partner. Elsewhere notes stay one
--    sentence (500 characters). Never health information.

-- 1 ---------------------------------------------------------------------------
alter table public.series
  add column default_interaction_type_id uuid references public.interaction_type (id) on delete set null;

-- 2 ---------------------------------------------------------------------------
create table public.activity_length (
  id           uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.residency (id) on delete cascade,
  kind         public.activity_kind not null,
  minutes      integer not null check (minutes between 1 and 600),
  updated_at   timestamptz not null default now(),
  unique (residency_id, kind)
);
create trigger activity_length_set_updated_at before update on public.activity_length for each row execute function public.set_updated_at();
create trigger activity_length_audit after insert or update on public.activity_length for each row execute function public.write_audit_log();

alter table public.activity_length enable row level security;
revoke all on public.activity_length from anon, authenticated;
grant select, insert, update on public.activity_length to authenticated;
create policy "activity_length: residency people read" on public.activity_length for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "activity_length: planners add" on public.activity_length for insert to authenticated
  with check ((select public.can_schedule(residency_id)));
create policy "activity_length: planners update" on public.activity_length for update to authenticated
  using ((select public.can_schedule(residency_id)))
  with check ((select public.can_schedule(residency_id)));

-- 3 ---------------------------------------------------------------------------
alter table public.site
  add column detailed_relationship_notes boolean not null default false;
comment on column public.site.detailed_relationship_notes is
  'Partner asks for a written note on each one-to-one; allows paragraph notes and the daily Word document. No health information.';

alter table public.relationship_activity drop constraint relationship_activity_note_check;
alter table public.relationship_activity
  add constraint relationship_activity_note_check check (note is null or length(note) <= 3000);
comment on column public.relationship_activity.note is
  'One sentence (500 characters), or a paragraph at sites with detailed notes. No health information.';

-- Musicians may not be able to read the site row, so this runs as definer.
create function public.relationship_note_length_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.note is not null and length(new.note) > 500
     and not coalesce((select s.detailed_relationship_notes from public.site s where s.id = new.site_id), false) then
    raise exception 'keep the note to one sentence (500 characters)' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.relationship_note_length_guard() from public, anon, authenticated;
create trigger relationship_note_length_guard before insert or update of note, site_id on public.relationship_activity
  for each row execute function public.relationship_note_length_guard();

-- 4 ---------------------------------------------------------------------------
-- "Submit my week": hours for a week can be submitted only once every program
-- the musician led that week (and that has happened) is documented.
create function public.undocumented_led_sessions(p_person uuid, p_residency uuid, p_week date)
returns table (session_id uuid, title text, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select se.id, se.title, se.starts_at
  from public.session se
  join public.session_assignment a on a.session_id = se.id
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  where se.residency_id = p_residency
    and se.kind = 'group_session'
    and se.schedule_state <> 'canceled'
    and se.starts_at <= now()
    and (se.starts_at at time zone st.timezone)::date between p_week and p_week + 6
    and a.person_id = p_person and a.role = 'leader' and a.status <> 'absent'
    and not exists (select 1 from public.session_report r where r.session_id = se.id)
    and (p_person = (select auth.uid()) or public.is_admin() or public.can_schedule(p_residency))
  order by se.starts_at;
$$;
revoke all on function public.undocumented_led_sessions(uuid, uuid, date) from public, anon;
grant execute on function public.undocumented_led_sessions(uuid, uuid, date) to authenticated;

create function public.time_entry_documented_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state = 'submitted' and old.state = 'draft'
     and exists (select 1 from public.undocumented_led_sessions(new.person_id, new.residency_id, new.week_starting)) then
    raise exception 'document the programs you led this week before submitting hours' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.time_entry_documented_guard() from public, anon, authenticated;
create trigger time_entry_documented_guard before update of state on public.time_entry
  for each row execute function public.time_entry_documented_guard();
