-- Usual leaders and private calendar links. Decided by Lauren, Nov 22, 2026
-- (DOMAIN-MODEL v0.15).
--
-- 1. Series.default_leader_id: a weekly program's usual leader. Filling in a
--    month makes them the leader on every date; programs without one are
--    left for the point person to assign.
-- 2. calendar_feed: one private link per musician that calendar apps
--    (Google, Apple, Outlook) subscribe to. It lists the published programs
--    they play in, plus their programs' special events. The token is a
--    secret; the feed reads through calendar_feed_events(), which anon can
--    call only with a valid token. Needs Ryan's security review before
--    going live.

alter table public.series add column default_leader_id uuid references public.person (id) on delete restrict;
comment on column public.series.default_leader_id is 'Usual leader; made leader on each date when a month is filled in. Optional.';

create or replace function public.generate_series_month(p_series uuid, p_month date)
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
    insert into public.session (residency_id, series_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes)
    values (s.residency_id, s.id, s.kind, s.title, s.default_location_id,
            (d + coalesce(s.start_time, time '00:00')) at time zone tz, s.start_time is not null, s.minutes)
    on conflict (series_id, starts_at) where series_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      created := created + 1;
      -- Usual musicians, plus the usual leader (if any) as the date's leader.
      insert into public.session_assignment (session_id, person_id, role)
      select new_id, p.person_id, case when p.person_id = s.default_leader_id then 'leader'::public.assignment_role else 'participant' end
      from (select sdp.person_id from public.series_default_person sdp where sdp.series_id = s.id
            union select s.default_leader_id where s.default_leader_id is not null) p
      where exists (select 1 from public.roster_member rm join public.season se on se.id = rm.season_id
                    where se.residency_id = s.residency_id and rm.person_id = p.person_id
                      and d between se.starts_on and se.ends_on and (rm.left_on is null or rm.left_on >= d));
      new_id := null;
    end if;
  end loop;
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private calendar links
-- ---------------------------------------------------------------------------

create table public.calendar_feed (
  person_id  uuid primary key references public.person (id) on delete cascade,
  token      text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
comment on table public.calendar_feed is 'A musician''s private calendar subscription link. Reset by replacing the token.';

alter table public.calendar_feed enable row level security;
revoke all on public.calendar_feed from anon, authenticated;
grant select, insert, update on public.calendar_feed to authenticated;
create policy "calendar_feed: own" on public.calendar_feed for select to authenticated
  using (person_id = (select auth.uid()) and (select public.is_active_person()));
create policy "calendar_feed: create own" on public.calendar_feed for insert to authenticated
  with check (person_id = (select auth.uid()) and (select public.is_active_person()));
create policy "calendar_feed: reset own" on public.calendar_feed for update to authenticated
  using (person_id = (select auth.uid())) with check (person_id = (select auth.uid()));

-- What a calendar link shows: published or canceled programs the person plays
-- in (not absent), plus special events of programs they're on, from 60 days
-- ago to a year ahead. Returns nothing for an unknown token or an inactive
-- person.
create function public.calendar_feed_events(p_token text)
returns table (
  session_id uuid, starts_at timestamptz, minutes integer, has_set_time boolean, title text,
  canceled boolean, is_special_event boolean, residency_name text, site_name text, room text,
  timezone text, musicians text, updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select f.person_id from public.calendar_feed f join public.person p on p.id = f.person_id
    where f.token = p_token and p.active and length(p_token) >= 32
  ),
  mine as (
    select se.id from public.session se join public.session_assignment sa on sa.session_id = se.id
    where sa.person_id = (select person_id from me) and sa.status <> 'absent'
    union
    select se.id from public.session se
    where se.is_special_event and exists (
      select 1 from public.roster_member rm join public.season s on s.id = rm.season_id
      where s.residency_id = se.residency_id and rm.person_id = (select person_id from me)
        and s.ends_on >= current_date and (rm.left_on is null or rm.left_on >= current_date))
  )
  select se.id, se.starts_at, coalesce(se.scheduled_minutes, 60), se.has_set_time, se.title,
         se.schedule_state = 'canceled', se.is_special_event, r.name, st.display_name, l.display_name,
         st.timezone,
         (select string_agg(split_part(p.name, ' ', 1), ', ' order by (sa.role = 'leader') desc, p.name)
            from public.session_assignment sa join public.person p on p.id = sa.person_id
            where sa.session_id = se.id and sa.status <> 'absent'),
         se.updated_at
  from public.session se
  join public.residency r on r.id = se.residency_id
  join public.location l on l.id = se.location_id
  join public.site st on st.id = l.site_id
  where se.id in (select id from mine)
    and se.schedule_state <> 'draft'
    and se.starts_at between now() - interval '60 days' and now() + interval '1 year';
$$;
revoke all on function public.calendar_feed_events(text) from public;
grant execute on function public.calendar_feed_events(text) to anon, authenticated;
