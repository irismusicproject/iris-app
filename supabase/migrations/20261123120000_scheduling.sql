-- Scheduling: residencies, seasons, rosters, point persons, weekly series,
-- dated sessions, who plays, and partner-calendar versions.
-- See docs/DOMAIN-MODEL.md sections 2, 3 and 7, and decisions D1, D5, D10,
-- D11 and D16 (all settled Nov 21, 2026).
--
-- Not in this migration (later, additive): partner agreements (D4/D9),
-- special projects, change requests, closures and blackout dates.
--
-- Permission rules (DOMAIN-MODEL section 7):
--   * Admins: everything.
--   * "Schedulers" for a residency (its current Admin Lead, its current point
--     person, admins) create and edit series and sessions, draft or published,
--     and publish months.
--   * The current point person (or an admin) marks a month reviewed.
--   * Anyone on a current roster of the residency, and its Iris staff, can
--     read the residency, its sites, sessions and calendar versions.
--   * A musician assigned to a published session can mark themselves absent
--     and name a substitute (any active person), who joins the roster as a
--     non-core member (D11, D16). Done only through
--     mark_absent_with_substitute().
--   * Nothing is deleted. Residencies end, people leave rosters, sessions are
--     canceled.
--   * Changes to sessions and assignments are recorded in audit_log.

create type public.residency_status    as enum ('planned', 'active', 'paused', 'ended');
create type public.season_kind         as enum ('semester', 'season', 'summer_session', 'other');
create type public.staff_role          as enum ('point_person', 'support');
create type public.schedule_state      as enum ('draft', 'published', 'canceled');
create type public.cancellation_reason as enum ('partner', 'weather', 'musician', 'other');
create type public.assignment_role     as enum ('leader', 'participant');
create type public.assignment_status   as enum ('assigned', 'absent', 'substitute');
create type public.calendar_state      as enum ('reviewed', 'sent');

-- ---------------------------------------------------------------------------
-- Residency, its sites, seasons
-- ---------------------------------------------------------------------------

create table public.residency (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partner (id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 200),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  status       public.residency_status not null default 'planned',
  started_on   date,
  ended_on     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index residency_partner_id_idx on public.residency (partner_id);
comment on table public.residency is
  'Iris''s engagement with one Partner at one or more Sites ("the program at Mather"). D1.';

create table public.residency_site (
  residency_id uuid not null references public.residency (id) on delete restrict,
  site_id      uuid not null references public.site (id) on delete restrict,
  primary key (residency_id, site_id)
);
create index residency_site_site_id_idx on public.residency_site (site_id);

create table public.season (
  id           uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.residency (id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 200),
  starts_on    date not null,
  ends_on      date not null,
  kind         public.season_kind not null default 'season',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index season_residency_id_idx on public.season (residency_id);
comment on table public.season is 'Dated period of a residency, set per residency (D8).';

-- ---------------------------------------------------------------------------
-- Roster and Iris staff
-- ---------------------------------------------------------------------------

create table public.roster_member (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.season (id) on delete restrict,
  person_id     uuid not null references public.person (id) on delete restrict,
  is_core       boolean not null default true,
  is_admin_lead boolean not null default false,
  joined_on     date not null default current_date,
  left_on       date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (season_id, person_id),
  check (left_on is null or left_on >= joined_on)
);
create index roster_member_person_id_idx on public.roster_member (person_id);
-- At most one Admin Lead per season (D5).
create unique index roster_member_one_admin_lead on public.roster_member (season_id) where is_admin_lead;

create table public.staff_assignment (
  id           uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.residency (id) on delete restrict,
  person_id    uuid not null references public.person (id) on delete restrict,
  role         public.staff_role not null,
  starts_on    date not null default current_date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index staff_assignment_residency_id_idx on public.staff_assignment (residency_id);
create index staff_assignment_person_id_idx on public.staff_assignment (person_id);

-- ---------------------------------------------------------------------------
-- Series (weekly offerings) and sessions (dated occurrences)
-- ---------------------------------------------------------------------------

create table public.series (
  id                  uuid primary key default gen_random_uuid(),
  residency_id        uuid not null references public.residency (id) on delete restrict,
  title               text not null check (length(btrim(title)) between 1 and 200),
  default_location_id uuid not null references public.location (id) on delete restrict,
  weekdays            smallint[] not null check (cardinality(weekdays) >= 1 and weekdays <@ '{1,2,3,4,5,6,7}'),
  start_time          time not null,
  minutes             integer not null check (minutes between 5 and 600),
  active_from         date not null,
  active_until        date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (active_until is null or active_until >= active_from)
);
create index series_residency_id_idx on public.series (residency_id);
comment on column public.series.weekdays is 'ISO weekdays: 1 = Monday … 7 = Sunday. Weekly recurrence.';
comment on column public.series.title is 'Title only; never personnel or location (D12).';

create table public.series_default_person (
  series_id uuid not null references public.series (id) on delete cascade,
  person_id uuid not null references public.person (id) on delete restrict,
  primary key (series_id, person_id)
);

create table public.session (
  id                  uuid primary key default gen_random_uuid(),
  residency_id        uuid not null references public.residency (id) on delete restrict,
  series_id           uuid references public.series (id) on delete restrict,
  title               text not null check (length(btrim(title)) between 1 and 200),
  location_id         uuid not null references public.location (id) on delete restrict,
  starts_at           timestamptz not null,
  scheduled_minutes   integer not null check (scheduled_minutes between 5 and 600),
  call_time           time,
  is_special_event    boolean not null default false,
  is_extra            boolean not null default false,
  billable            boolean not null default true,
  schedule_state      public.schedule_state not null default 'draft',
  cancellation_reason public.cancellation_reason,
  canceled_at         timestamptz,
  public_note         text check (public_note is null or length(public_note) <= 500),
  internal_note       text check (internal_note is null or length(internal_note) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((schedule_state = 'canceled') = (cancellation_reason is not null))
);
create index session_residency_starts_idx on public.session (residency_id, starts_at);
create index session_location_id_idx on public.session (location_id);
create unique index session_series_start_key on public.session (series_id, starts_at) where series_id is not null;
comment on column public.session.internal_note is 'Never prints on partner documents.';

create table public.session_assignment (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.session (id) on delete restrict,
  person_id         uuid not null references public.person (id) on delete restrict,
  role              public.assignment_role not null default 'participant',
  status            public.assignment_status not null default 'assigned',
  substitute_for_id uuid references public.person (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (session_id, person_id),
  check ((status = 'substitute') = (substitute_for_id is not null))
);
create index session_assignment_person_id_idx on public.session_assignment (person_id);
-- At most one playing leader per session. Publishing requires exactly one.
create unique index session_assignment_one_leader
  on public.session_assignment (session_id) where role = 'leader' and status <> 'absent';

-- ---------------------------------------------------------------------------
-- Partner calendar versions (D5)
-- ---------------------------------------------------------------------------

create table public.calendar_export (
  id               uuid primary key default gen_random_uuid(),
  residency_id     uuid not null references public.residency (id) on delete restrict,
  site_id          uuid not null references public.site (id) on delete restrict,
  month            date not null check (extract(day from month) = 1),
  version          integer not null check (version >= 1),
  state            public.calendar_state not null,
  reviewed_by      uuid references public.person (id) on delete restrict,
  reviewed_at      timestamptz,
  generated_by     uuid references public.person (id) on delete restrict,
  generated_at     timestamptz,
  sent_at          timestamptz,
  partner_feedback text check (partner_feedback is null or length(partner_feedback) <= 4000),
  created_at       timestamptz not null default now(),
  unique (residency_id, site_id, month, version),
  check (state = 'reviewed' or generated_at is not null)
);
comment on column public.calendar_export.month is 'First day of the calendar month.';
comment on column public.calendar_export.partner_feedback is 'Internal. Never prints.';

-- ---------------------------------------------------------------------------
-- Audit log (DOMAIN-MODEL section 6). Written only by triggers.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  table_name text not null,
  row_id     uuid not null,
  action     text not null check (action in ('insert', 'update')),
  before     jsonb,
  after      jsonb
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values ((select auth.uid()), tg_table_name, new.id, lower(tg_op),
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can use them without
-- recursing into each other's RLS).
-- ---------------------------------------------------------------------------

-- The person is on a roster of this residency for a season that hasn't ended.
create function public.is_on_current_roster(p_residency uuid, p_person uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.roster_member rm
    join public.season s on s.id = rm.season_id
    where s.residency_id = p_residency
      and rm.person_id = coalesce(p_person, (select auth.uid()))
      and s.ends_on >= current_date
      and (rm.left_on is null or rm.left_on >= current_date)
  );
$$;

create function public.is_current_admin_lead(p_residency uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.roster_member rm
    join public.season s on s.id = rm.season_id
    where s.residency_id = p_residency
      and rm.person_id = (select auth.uid())
      and rm.is_admin_lead
      and s.ends_on >= current_date
      and (rm.left_on is null or rm.left_on >= current_date)
  );
$$;

create function public.is_current_staff(p_residency uuid, p_role public.staff_role default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_active_person() and exists (
    select 1 from public.staff_assignment sa
    where sa.residency_id = p_residency
      and sa.person_id = (select auth.uid())
      and (p_role is null or sa.role = p_role)
      and sa.starts_on <= current_date
      and (sa.ends_on is null or sa.ends_on >= current_date)
  );
$$;

-- Can read the residency and its schedule.
create function public.can_view_residency(p_residency uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or public.is_on_current_roster(p_residency)
      or public.is_current_staff(p_residency);
$$;

-- Can create and edit series and sessions, and publish months (D5).
create function public.can_schedule(p_residency uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or public.is_current_admin_lead(p_residency)
      or public.is_current_staff(p_residency, 'point_person');
$$;

-- The date and month of a session in its site's time zone.
create function public.session_local_date(p_session uuid)
returns date language sql stable security definer set search_path = ''
as $$
  select (se.starts_at at time zone st.timezone)::date
  from public.session se
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  where se.id = p_session;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'is_on_current_roster(uuid, uuid)', 'is_current_admin_lead(uuid)',
    'is_current_staff(uuid, public.staff_role)', 'can_view_residency(uuid)',
    'can_schedule(uuid)', 'session_local_date(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- A residency's sites belong to its partner; a residency can't change partner.
create function public.residency_site_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.residency r join public.site s on s.partner_id = r.partner_id
    where r.id = new.residency_id and s.id = new.site_id
  ) then
    raise exception 'a residency''s sites must belong to its partner' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger residency_site_guard before insert or update on public.residency_site
  for each row execute function public.residency_site_guard();

create function public.residency_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.partner_id is distinct from old.partner_id then
    raise exception 'a residency cannot move to another partner' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger residency_guard before update on public.residency
  for each row execute function public.residency_guard();

-- A location used by a series or session must be at one of the residency's
-- sites, and a session from a series must be in the same residency.
create function public.location_in_residency(p_residency uuid, p_location uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.location l
    join public.residency_site rs on rs.site_id = l.site_id
    where l.id = p_location and rs.residency_id = p_residency
  );
$$;

create function public.series_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.location_in_residency(new.residency_id, new.default_location_id) then
    raise exception 'the location must be at one of the residency''s sites' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.residency_id is distinct from old.residency_id then
    raise exception 'a series cannot move to another residency' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger series_guard before insert or update on public.series
  for each row execute function public.series_guard();

create function public.session_guard()
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
    -- Publishing happens through publish_month(), which checks review and leaders.
    if old.schedule_state = 'draft' and new.schedule_state = 'published'
       and coalesce(current_setting('iris.publishing', true), '') <> 'on' then
      raise exception 'publish a month with publish_month()' using errcode = '42501';
    end if;
    if old.schedule_state = 'canceled' and new.schedule_state <> 'canceled' then
      raise exception 'a canceled session stays canceled; schedule a new one' using errcode = '42501';
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
create trigger session_guard before insert or update on public.session
  for each row execute function public.session_guard();

-- Who plays must be on a roster of the residency for a season covering the
-- session's date (D16).
create function public.session_assignment_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d date; r uuid;
begin
  select public.session_local_date(new.session_id), se.residency_id
    into d, r from public.session se where se.id = new.session_id;
  if not exists (
    select 1 from public.roster_member rm
    join public.season s on s.id = rm.season_id
    where s.residency_id = r and rm.person_id = new.person_id
      and d between s.starts_on and s.ends_on
      and (rm.left_on is null or rm.left_on >= d)
  ) then
    raise exception 'that person isn''t on the roster for this date' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.session_id is distinct from old.session_id
                           or new.person_id is distinct from old.person_id) then
    raise exception 'change who plays by adding an assignment' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger session_assignment_guard before insert or update on public.session_assignment
  for each row execute function public.session_assignment_guard();

create function public.season_roster_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.season_id is distinct from old.season_id
                           or new.person_id is distinct from old.person_id) then
    raise exception 'add a new roster entry instead' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger roster_member_guard before insert or update on public.roster_member
  for each row execute function public.season_roster_guard();

create trigger residency_set_updated_at before update on public.residency
  for each row execute function public.set_updated_at();
create trigger season_set_updated_at before update on public.season
  for each row execute function public.set_updated_at();
create trigger staff_assignment_set_updated_at before update on public.staff_assignment
  for each row execute function public.set_updated_at();
create trigger series_set_updated_at before update on public.series
  for each row execute function public.set_updated_at();

create trigger session_audit after insert or update on public.session
  for each row execute function public.write_audit_log();
create trigger session_assignment_audit after insert or update on public.session_assignment
  for each row execute function public.write_audit_log();
create trigger calendar_export_audit after insert or update on public.calendar_export
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.residency             enable row level security;
alter table public.residency_site        enable row level security;
alter table public.season                enable row level security;
alter table public.roster_member         enable row level security;
alter table public.staff_assignment      enable row level security;
alter table public.series                enable row level security;
alter table public.series_default_person enable row level security;
alter table public.session               enable row level security;
alter table public.session_assignment    enable row level security;
alter table public.calendar_export       enable row level security;
alter table public.audit_log             enable row level security;

revoke all on public.residency, public.residency_site, public.season, public.roster_member,
  public.staff_assignment, public.series, public.series_default_person, public.session,
  public.session_assignment, public.calendar_export, public.audit_log
  from anon, authenticated;

grant select, insert, update on public.residency, public.residency_site, public.season,
  public.roster_member, public.staff_assignment, public.series, public.session,
  public.session_assignment to authenticated;
-- Default personnel is a plain list, so schedulers may remove entries.
grant select, insert, delete on public.series_default_person to authenticated;
-- Calendar versions are written only by the functions below.
grant select on public.calendar_export to authenticated;
grant select on public.audit_log to authenticated;

-- Residency, its sites, seasons: readable by its people; admins manage them.
create policy "residency: its people read" on public.residency for select to authenticated
  using ((select public.can_view_residency(id)));
create policy "residency: admins add" on public.residency for insert to authenticated
  with check ((select public.is_admin()));
create policy "residency: admins update" on public.residency for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "residency_site: its people read" on public.residency_site for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "residency_site: admins add" on public.residency_site for insert to authenticated
  with check ((select public.is_admin()));
create policy "residency_site: admins update" on public.residency_site for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "season: its people read" on public.season for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "season: admins add" on public.season for insert to authenticated
  with check ((select public.is_admin()));
create policy "season: admins update" on public.season for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Roster and staff: readable by the residency's people; admins manage them
-- (subs join through mark_absent_with_substitute()).
create policy "roster_member: its people read" on public.roster_member for select to authenticated
  using ((select public.can_view_residency(
    (select s.residency_id from public.season s where s.id = roster_member.season_id))));
create policy "roster_member: admins add" on public.roster_member for insert to authenticated
  with check ((select public.is_admin()));
create policy "roster_member: admins update" on public.roster_member for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "staff_assignment: its people read" on public.staff_assignment for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "staff_assignment: admins add" on public.staff_assignment for insert to authenticated
  with check ((select public.is_admin()));
create policy "staff_assignment: admins update" on public.staff_assignment for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Series and sessions: readable by the residency's people; schedulers write.
create policy "series: its people read" on public.series for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "series: schedulers add" on public.series for insert to authenticated
  with check ((select public.can_schedule(residency_id)));
create policy "series: schedulers update" on public.series for update to authenticated
  using ((select public.can_schedule(residency_id))) with check ((select public.can_schedule(residency_id)));

create policy "series_default_person: its people read" on public.series_default_person for select to authenticated
  using ((select public.can_view_residency((select sr.residency_id from public.series sr where sr.id = series_default_person.series_id))));
create policy "series_default_person: schedulers add" on public.series_default_person for insert to authenticated
  with check ((select public.can_schedule((select sr.residency_id from public.series sr where sr.id = series_default_person.series_id))));
create policy "series_default_person: schedulers remove" on public.series_default_person for delete to authenticated
  using ((select public.can_schedule((select sr.residency_id from public.series sr where sr.id = series_default_person.series_id))));

create policy "session: its people read" on public.session for select to authenticated
  using ((select public.can_view_residency(residency_id)));
create policy "session: schedulers add" on public.session for insert to authenticated
  with check ((select public.can_schedule(residency_id)));
create policy "session: schedulers update" on public.session for update to authenticated
  using ((select public.can_schedule(residency_id))) with check ((select public.can_schedule(residency_id)));

create policy "session_assignment: its people read" on public.session_assignment for select to authenticated
  using ((select public.can_view_residency((select ss.residency_id from public.session ss where ss.id = session_assignment.session_id))));
create policy "session_assignment: schedulers add" on public.session_assignment for insert to authenticated
  with check ((select public.can_schedule((select ss.residency_id from public.session ss where ss.id = session_assignment.session_id))));
create policy "session_assignment: schedulers update" on public.session_assignment for update to authenticated
  using ((select public.can_schedule((select ss.residency_id from public.session ss where ss.id = session_assignment.session_id))))
  with check ((select public.can_schedule((select ss.residency_id from public.session ss where ss.id = session_assignment.session_id))));

create policy "calendar_export: its people read" on public.calendar_export for select to authenticated
  using ((select public.can_view_residency(residency_id)));

create policy "audit_log: admins read" on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- Roster members and staff of a residency can read its sites and locations
-- (Ryan's note on partner/site/location: "admins only, until rosters exist").
create policy "site: residency people read" on public.site for select to authenticated
  using (exists (select 1 from public.residency_site rs
                 where rs.site_id = site.id and (select public.can_view_residency(rs.residency_id))));
create policy "location: residency people read" on public.location for select to authenticated
  using (exists (select 1 from public.residency_site rs
                 where rs.site_id = location.site_id and (select public.can_view_residency(rs.residency_id))));

-- ---------------------------------------------------------------------------
-- Actions (business rules live here, so web and native apps behave the same)
-- ---------------------------------------------------------------------------

-- Create the draft sessions of a weekly series for one month. Skips dates
-- that already have a session from this series. Default personnel are added
-- as participants; the scheduler then picks each session's leader.
create function public.generate_series_month(p_series uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  s public.series%rowtype; tz text; d date; created integer := 0; new_id uuid;
  first_day date := date_trunc('month', p_month)::date;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id
   where l.id = s.default_location_id;
  for d in select g::date from generate_series(first_day, (first_day + interval '1 month - 1 day')::date, interval '1 day') g loop
    continue when extract(isodow from d)::smallint <> all (s.weekdays);
    continue when d < s.active_from or (s.active_until is not null and d > s.active_until);
    insert into public.session (residency_id, series_id, title, location_id, starts_at, scheduled_minutes)
    values (s.residency_id, s.id, s.title, s.default_location_id, (d + s.start_time) at time zone tz, s.minutes)
    on conflict (series_id, starts_at) where series_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      created := created + 1;
      insert into public.session_assignment (session_id, person_id, role)
      select new_id, sdp.person_id, 'participant' from public.series_default_person sdp
      where sdp.series_id = s.id
        and exists (select 1 from public.roster_member rm join public.season se on se.id = rm.season_id
                    where se.residency_id = s.residency_id and rm.person_id = sdp.person_id
                      and d between se.starts_on and se.ends_on and (rm.left_on is null or rm.left_on >= d));
      new_id := null;
    end if;
  end loop;
  return created;
end;
$$;

-- Step 2 of publishing (D5): the point person (or an admin) marks a site's
-- draft month reviewed. Creates calendar version 1.
create function public.mark_month_reviewed(p_residency uuid, p_site uuid, p_month date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the point person or an admin can mark a month reviewed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.residency_site where residency_id = p_residency and site_id = p_site) then
    raise exception 'that site isn''t part of this residency' using errcode = '23514';
  end if;
  if exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m) then
    raise exception 'this month has already been reviewed' using errcode = '23505';
  end if;
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at)
  values (p_residency, p_site, m, 1, 'reviewed', (select auth.uid()), now())
  returning calendar_export.id into v_id;
  return v_id;
end;
$$;

-- Sessions of a residency at a site in a month (site's local time).
create function public.month_sessions(p_residency uuid, p_site uuid, p_month date)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select se.id from public.session se
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  where se.residency_id = p_residency and st.id = p_site
    and date_trunc('month', se.starts_at at time zone st.timezone)::date = date_trunc('month', p_month)::date;
$$;

-- Step 3 (D5): "Publish and download". Publishes the site's draft sessions
-- for the month and turns version 1 into "sent". Every session that isn't
-- canceled needs exactly one playing leader.
create function public.publish_month(p_residency uuid, p_site uuid, p_month date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; v public.calendar_export%rowtype; missing integer;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and version = 1;
  if not found then
    raise exception 'the point person must mark this month reviewed first' using errcode = '23514';
  end if;
  if v.state = 'sent' then
    raise exception 'this month is already published; download an updated version instead' using errcode = '23514';
  end if;
  select count(*) into missing from public.month_sessions(p_residency, p_site, m) ms(id)
   join public.session se on se.id = ms.id
   where se.schedule_state <> 'canceled'
     and (select count(*) from public.session_assignment sa
          where sa.session_id = se.id and sa.role = 'leader' and sa.status <> 'absent') <> 1;
  if missing > 0 then
    raise exception '% session(s) still need a leader', missing using errcode = '23514';
  end if;
  perform set_config('iris.publishing', 'on', true);
  update public.session set schedule_state = 'published'
   where id in (select * from public.month_sessions(p_residency, p_site, m)) and schedule_state = 'draft';
  perform set_config('iris.publishing', 'off', true);
  update public.calendar_export
     set state = 'sent', generated_by = (select auth.uid()), generated_at = now(), sent_at = now()
   where id = v.id;
  return v.id;
end;
$$;

-- Step 5 (D5): after partner feedback, create the next calendar version.
-- New draft sessions added to the month are published with it.
create function public.new_calendar_version(p_residency uuid, p_site uuid, p_month date, p_partner_feedback text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; last_v integer; v_id uuid;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select max(version) into last_v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent';
  if last_v is null then
    raise exception 'publish version 1 first' using errcode = '23514';
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

-- D11 and D16: a musician on a published session marks themselves absent
-- and names their substitute (any active person). The sub joins the season's
-- roster as non-core if needed, and takes over the leader role if the
-- absent musician was leading.
create function public.mark_absent_with_substitute(p_session uuid, p_substitute uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid()); a public.session_assignment%rowtype;
  se public.session%rowtype; d date; v_season uuid; v_id uuid;
begin
  if not public.is_active_person() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into se from public.session where session.id = p_session;
  if not found or se.schedule_state <> 'published' then
    raise exception 'substitutes are recorded on published sessions' using errcode = '23514';
  end if;
  select * into a from public.session_assignment
   where session_id = p_session and person_id = me and status = 'assigned';
  if not found then
    raise exception 'you aren''t playing in this session' using errcode = '42501';
  end if;
  if p_substitute = me or not exists (select 1 from public.person where person.id = p_substitute and active) then
    raise exception 'pick an active musician as the substitute' using errcode = '23514';
  end if;
  if exists (select 1 from public.session_assignment where session_id = p_session and person_id = p_substitute) then
    raise exception 'that person is already on this session' using errcode = '23505';
  end if;
  d := public.session_local_date(p_session);
  select s.id into v_season from public.season s
   where s.residency_id = se.residency_id and d between s.starts_on and s.ends_on
   order by s.starts_on desc limit 1;
  if v_season is null then
    raise exception 'no season covers this date' using errcode = '23514';
  end if;
  insert into public.roster_member (season_id, person_id, is_core, joined_on)
  values (v_season, p_substitute, false, least(current_date, d))
  on conflict (season_id, person_id) do nothing;
  update public.session_assignment set status = 'absent' where session_assignment.id = a.id;
  insert into public.session_assignment (session_id, person_id, role, status, substitute_for_id)
  values (p_session, p_substitute, a.role, 'substitute', me)
  returning session_assignment.id into v_id;
  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'generate_series_month(uuid, date)', 'mark_month_reviewed(uuid, uuid, date)',
    'month_sessions(uuid, uuid, date)', 'publish_month(uuid, uuid, date)',
    'new_calendar_version(uuid, uuid, date, text)', 'mark_absent_with_substitute(uuid, uuid)',
    'location_in_residency(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
