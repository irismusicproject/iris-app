-- Documentation: session reports, residents, relationship-building activities
-- and monthly reflections. DOMAIN-MODEL section 4 (v0.14) and decisions D2,
-- D3, D6, D7, D14, D15, plus Lauren's Nov 22, 2026 decisions from the CESLC
-- workbook sample:
--   * Program types (InteractionType): Music Instructional Program,
--     Lecture/Discussion, Open Rehearsal, Performance, Interdisciplinary
--     Program, Other.
--   * Relationship-building activity types: one-to-one, mini-group session,
--     hallway concert. Each has Collab? (yes/no) and required minutes.
--   * Documented weekly: due Tuesday 5 pm for the previous week (D7).
--
-- Permission rules (section 7):
--   * Session reports: written by the session's playing leader (or an
--     admin), for past, non-canceled group sessions; readable by the
--     residency's people.
--   * Residents: the current roster of a residency serving the site reads
--     and adds them; its point person reads; admins everything. Never health
--     information. (Logging every read, D14, is still to do: Ryan's side.)
--   * Activities and reflections: a musician writes their own; the point
--     person and admins read all of a residency's.
-- Not yet: approvals, time entries, engagement types (not in version 1).

create type public.resident_involvement as enum ('none', 'co_facilitated', 'co_led');
create type public.activity_kind        as enum ('one_to_one', 'mini_group', 'hallway_concert');
create type public.model_type           as enum ('performance', 'small_group', 'one_to_one');

-- ---------------------------------------------------------------------------
-- Program types (admin-managed list; retired, never deleted)
-- ---------------------------------------------------------------------------

create table public.interaction_type (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) between 1 and 100),
  model_type  public.model_type,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  description text
);
insert into public.interaction_type (name, model_type, sort_order) values
  ('Music Instructional Program', 'small_group', 1),
  ('Lecture/Discussion', 'small_group', 2),
  ('Open Rehearsal', 'performance', 3),
  ('Performance', 'performance', 4),
  ('Interdisciplinary Program', 'small_group', 5),
  ('Other', null, 6);

-- ---------------------------------------------------------------------------
-- Session reports (one per group session, by its leader; D3)
-- ---------------------------------------------------------------------------

create table public.session_report (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null unique references public.session (id) on delete restrict,
  author_id            uuid not null references public.person (id) on delete restrict,
  attendance           integer not null check (attendance between 0 and 2000),
  interaction_type_id  uuid not null references public.interaction_type (id) on delete restrict,
  resident_involvement public.resident_involvement not null default 'none',
  actual_minutes       integer not null check (actual_minutes between 1 and 600),
  notes                text check (notes is null or length(notes) <= 2000),
  submitted_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on column public.session_report.attendance is 'Everyone present: residents, staff, family, guests (D15).';
comment on column public.session_report.notes is 'No health information.';

-- ---------------------------------------------------------------------------
-- Residents (built up as musicians work; D14)
-- ---------------------------------------------------------------------------

create table public.resident (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.site (id) on delete restrict,
  display_name  text not null check (length(btrim(display_name)) between 1 and 80),
  disambiguator text not null default '' check (length(disambiguator) <= 80),
  active        boolean not null default true,
  created_by    uuid references public.person (id) on delete restrict,
  created_at    timestamptz not null default now()
);
create unique index resident_site_name_key on public.resident (site_id, lower(display_name), lower(disambiguator));
comment on table public.resident is 'First name + last initial. Never health information (D14).';

-- ---------------------------------------------------------------------------
-- Relationship-building activities (logged after they happen; D2)
-- ---------------------------------------------------------------------------

create table public.relationship_activity (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.person (id) on delete restrict,
  residency_id  uuid not null references public.residency (id) on delete restrict,
  site_id       uuid not null references public.site (id) on delete restrict,
  session_id    uuid references public.session (id) on delete restrict,
  occurred_on   date not null,
  kind          public.activity_kind not null,
  minutes       integer not null check (minutes between 1 and 600),
  collaborative boolean not null default false,
  note          text check (note is null or length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index relationship_activity_person_idx on public.relationship_activity (person_id, occurred_on);
create index relationship_activity_residency_idx on public.relationship_activity (residency_id, occurred_on);
comment on column public.relationship_activity.note is 'One sentence. No health information.';

create table public.relationship_activity_resident (
  activity_id uuid not null references public.relationship_activity (id) on delete cascade,
  resident_id uuid not null references public.resident (id) on delete restrict,
  primary key (activity_id, resident_id)
);

-- ---------------------------------------------------------------------------
-- Monthly reflection (D13)
-- ---------------------------------------------------------------------------

create table public.monthly_reflection (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.person (id) on delete restrict,
  residency_id uuid not null references public.residency (id) on delete restrict,
  month        date not null check (extract(day from month) = 1),
  highlights   text not null default '' check (length(highlights) <= 4000),
  challenges   text not null default '' check (length(challenges) <= 4000),
  updated_at   timestamptz not null default now(),
  unique (person_id, residency_id, month)
);

-- ---------------------------------------------------------------------------
-- Helpers and integrity
-- ---------------------------------------------------------------------------

-- The playing leader of a session.
create function public.is_session_leader(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.session_assignment
    where session_id = p_session and person_id = (select auth.uid())
      and role = 'leader' and status <> 'absent');
$$;

-- Can see and add residents at a site: current roster of a residency serving
-- it, its point person (see only, enforced by the insert policy), admins.
create function public.can_see_site_residents(p_site uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.residency_site rs
    where rs.site_id = p_site
      and (public.is_on_current_roster(rs.residency_id) or public.is_current_staff(rs.residency_id, 'point_person')));
$$;

create function public.can_add_site_residents(p_site uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.residency_site rs
    where rs.site_id = p_site and public.is_on_current_roster(rs.residency_id));
$$;

do $$
declare f text;
begin
  foreach f in array array['is_session_leader(uuid)', 'can_see_site_residents(uuid)', 'can_add_site_residents(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Reports only for past, non-canceled group sessions.
create function public.session_report_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare se public.session%rowtype;
begin
  select * into se from public.session where id = new.session_id;
  if se.schedule_state = 'canceled' or se.kind <> 'group_session' then
    raise exception 'only group sessions that happened are documented' using errcode = '23514';
  end if;
  if se.starts_at > now() then
    raise exception 'a session is documented after it happens' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.session_id is distinct from old.session_id then
    raise exception 'a report stays with its session' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger session_report_guard before insert or update on public.session_report
  for each row execute function public.session_report_guard();

-- An activity's site belongs to its residency; its session (if any) too.
create function public.relationship_activity_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.residency_site where residency_id = new.residency_id and site_id = new.site_id) then
    raise exception 'that site isn''t part of this program' using errcode = '23514';
  end if;
  if new.session_id is not null and not exists (
    select 1 from public.session where id = new.session_id and residency_id = new.residency_id) then
    raise exception 'that session belongs to another program' using errcode = '23514';
  end if;
  if new.occurred_on > current_date then
    raise exception 'activities are logged after they happen' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger relationship_activity_guard before insert or update on public.relationship_activity
  for each row execute function public.relationship_activity_guard();

-- Residents on an activity must be at the activity's site.
create function public.activity_resident_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.relationship_activity a join public.resident r on r.site_id = a.site_id
    where a.id = new.activity_id and r.id = new.resident_id) then
    raise exception 'that resident is at a different site' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger activity_resident_guard before insert on public.relationship_activity_resident
  for each row execute function public.activity_resident_guard();

create trigger monthly_reflection_set_updated_at before update on public.monthly_reflection
  for each row execute function public.set_updated_at();

create trigger session_report_audit after insert or update on public.session_report
  for each row execute function public.write_audit_log();
create trigger relationship_activity_audit after insert or update on public.relationship_activity
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.interaction_type               enable row level security;
alter table public.session_report                 enable row level security;
alter table public.resident                       enable row level security;
alter table public.relationship_activity          enable row level security;
alter table public.relationship_activity_resident enable row level security;
alter table public.monthly_reflection             enable row level security;

revoke all on public.interaction_type, public.session_report, public.resident, public.relationship_activity,
  public.relationship_activity_resident, public.monthly_reflection from anon, authenticated;
grant select on public.interaction_type to authenticated;
grant insert, update on public.interaction_type to authenticated;
grant select, insert, update on public.session_report, public.resident, public.relationship_activity, public.monthly_reflection to authenticated;
grant select, insert, delete on public.relationship_activity_resident to authenticated;
-- A musician can remove their own activity (a mistake) the same week.
grant delete on public.relationship_activity to authenticated;

create policy "interaction_type: signed-in people read" on public.interaction_type for select to authenticated
  using ((select public.is_active_person()));
create policy "interaction_type: admins manage" on public.interaction_type for insert to authenticated
  with check ((select public.is_admin()));
create policy "interaction_type: admins update" on public.interaction_type for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "session_report: residency people read" on public.session_report for select to authenticated
  using ((select public.can_view_residency((select s.residency_id from public.session s where s.id = session_report.session_id))));
create policy "session_report: leader or admin writes" on public.session_report for insert to authenticated
  with check (author_id = (select auth.uid()) and ((select public.is_session_leader(session_id)) or (select public.is_admin())));
create policy "session_report: leader or admin updates" on public.session_report for update to authenticated
  using ((select public.is_session_leader(session_id)) or (select public.is_admin()))
  with check ((select public.is_session_leader(session_id)) or (select public.is_admin()));

create policy "resident: site's people read" on public.resident for select to authenticated
  using ((select public.can_see_site_residents(site_id)));
create policy "resident: roster adds" on public.resident for insert to authenticated
  with check ((select public.can_add_site_residents(site_id)) and created_by = (select auth.uid()));
create policy "resident: admins update" on public.resident for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "relationship_activity: own, point person, admins read" on public.relationship_activity for select to authenticated
  using (person_id = (select auth.uid()) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person')));
create policy "relationship_activity: roster musicians log their own" on public.relationship_activity for insert to authenticated
  with check (person_id = (select auth.uid()) and (select public.is_on_current_roster(residency_id)));
create policy "relationship_activity: own updates" on public.relationship_activity for update to authenticated
  using (person_id = (select auth.uid()) or (select public.is_admin()))
  with check (person_id = (select auth.uid()) or (select public.is_admin()));
create policy "relationship_activity: own deletes" on public.relationship_activity for delete to authenticated
  using (person_id = (select auth.uid()) or (select public.is_admin()));

create policy "activity_resident: whoever sees the activity" on public.relationship_activity_resident for select to authenticated
  using (exists (select 1 from public.relationship_activity a where a.id = activity_id));
create policy "activity_resident: activity owner adds" on public.relationship_activity_resident for insert to authenticated
  with check (exists (select 1 from public.relationship_activity a where a.id = activity_id and a.person_id = (select auth.uid())));
create policy "activity_resident: activity owner removes" on public.relationship_activity_resident for delete to authenticated
  using (exists (select 1 from public.relationship_activity a where a.id = activity_id and a.person_id = (select auth.uid())));

create policy "monthly_reflection: own, point person, admins read" on public.monthly_reflection for select to authenticated
  using (person_id = (select auth.uid()) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person')));
create policy "monthly_reflection: own writes" on public.monthly_reflection for insert to authenticated
  with check (person_id = (select auth.uid()) and (select public.is_on_current_roster(residency_id)));
create policy "monthly_reflection: own updates" on public.monthly_reflection for update to authenticated
  using (person_id = (select auth.uid())) with check (person_id = (select auth.uid()));
