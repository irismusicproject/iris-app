-- The monthly scheduling cycle, part 2: requests, absences, day-of
-- cancellations and tasks (DOMAIN-MODEL v0.41 / D17; Lauren, Nov 23, 2026).
--
-- Each is one database function with its permission check inside:
--   request_leader_swap      a musician on a draft date, while the team edits
--   request_change           a musician on a date: a sub, or another change (after final)
--   withdraw_change_request  the requester, while it's open
--   decide_change_request    the point person (or an admin): approve or decline
--   set_unavailable          "I can't play": the musician, on a date they play, while the team edits
--   mark_not_there           "I wasn't there": the musician, on a date that has happened
--   take_lead_to_document    the first musician who played documents a date whose leader wasn't there
--   cancel_day_of            "Canceled day-of": the date's leader (or point person, admins), with a reason
--   my_tasks                 the signed-in person's To do list, calculated, never stored
--   queue_month_reminders    the emails that pair with tasks (called by the scheduler)
-- Musicians no longer set or change leaders themselves: they propose a swap
-- and the point person approves it (revises v0.18/v0.25). The point person,
-- admins and the Admin Lead still set leaders.
--
-- Additive only (expand): new table and functions; one new rule in an
-- existing trigger function (leaders). Nothing the phone app uses is renamed.

create table public.change_request (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.session (id) on delete cascade,
  kind               text not null check (kind in ('leader_swap', 'sub', 'other')),
  requested_by       uuid not null references public.person (id) on delete restrict,
  proposed_person_id uuid references public.person (id) on delete restrict,
  note               text check (note is null or length(note) <= 500),
  status             text not null default 'open' check (status in ('open', 'approved', 'declined', 'withdrawn')),
  decided_by         uuid references public.person (id) on delete restrict,
  decided_at         timestamptz,
  decision_note      text check (decision_note is null or length(decision_note) <= 500),
  created_at         timestamptz not null default now(),
  check ((kind in ('leader_swap', 'sub')) = (proposed_person_id is not null))
);
create unique index change_request_one_open on public.change_request (session_id, kind, requested_by) where status = 'open';
create index change_request_open_idx on public.change_request (session_id) where status = 'open';
comment on table public.change_request is 'A request to change a date: a leader swap on a draft, or any change after the month is final (v0.41).';

alter table public.change_request enable row level security;
revoke all on public.change_request from anon, authenticated;
grant select on public.change_request to authenticated;
create policy "change_request: the program's people read" on public.change_request for select to authenticated
  using (requested_by = (select auth.uid())
         or exists (select 1 from public.session se where se.id = session_id and (select public.can_view_residency(se.residency_id))));

-- A date's label in its building's time zone: "Tuesday, February 2 at 2:00 PM".
create function public.session_label(p_session uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select se.title || ', ' || to_char(se.starts_at at time zone st.timezone, 'FMDay, FMMonth FMDD') ||
         case when se.has_set_time then ' at ' || to_char(se.starts_at at time zone st.timezone, 'FMHH12:MI AM') else '' end
  from public.session se join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id
  where se.id = p_session;
$$;
revoke all on function public.session_label(uuid) from public, anon, authenticated;

create function public.my_assignment(p_session uuid)
returns public.session_assignment language sql stable security definer set search_path = ''
as $$
  select * from public.session_assignment where session_id = p_session and person_id = (select auth.uid());
$$;
revoke all on function public.my_assignment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

create function public.request_leader_swap(p_session uuid, p_person uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare se public.session; sm public.schedule_month; me public.session_assignment; v_id uuid; who text; to_name text;
begin
  select * into se from public.session where id = p_session;
  me := public.my_assignment(p_session);
  if se.id is null or me.session_id is null or me.status = 'absent' or not public.is_active_person() then
    raise exception 'only a musician playing this date can propose a leader swap' using errcode = '42501';
  end if;
  if se.schedule_state <> 'draft' or se.kind <> 'group_session' then
    raise exception 'leader swaps are proposed on draft dates while the team edits' using errcode = '23514';
  end if;
  sm := public.session_schedule_month(p_session);
  if not (sm.stage = 'team_editing' or (sm.id is null and not public.is_session_month_reviewed(p_session))) then
    raise exception 'this month is past team editing; ask the point person' using errcode = '23514';
  end if;
  if not exists (select 1 from public.session_assignment where session_id = p_session and role = 'leader' and status <> 'absent') then
    raise exception 'this date has no leader yet; the point person sets one' using errcode = '23514';
  end if;
  if not exists (select 1 from public.session_assignment where session_id = p_session and person_id = p_person
                 and status <> 'absent' and role <> 'leader') then
    raise exception 'pick another musician playing this date' using errcode = '23514';
  end if;
  insert into public.change_request (session_id, kind, requested_by, proposed_person_id, note)
  values (p_session, 'leader_swap', (select auth.uid()), p_person, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  select name into who from public.person where id = (select auth.uid());
  select name into to_name from public.person where id = p_person;
  perform public.notify_point_people(se.residency_id, 'change_requested',
    'Leader swap to approve: ' || public.session_label(p_session),
    coalesce(who, 'A musician') || ' proposes that ' || coalesce(to_name, 'another musician') || ' leads ' || public.session_label(p_session) || '.' ||
    chr(10) || 'Approve or decline it in To do.', 'change_requested:' || v_id);
  return v_id;
end;
$$;
revoke all on function public.request_leader_swap(uuid, uuid, text) from public, anon;
grant execute on function public.request_leader_swap(uuid, uuid, text) to authenticated;

-- A sub (any time) or another change (after final), for the point person to approve.
create function public.request_change(p_session uuid, p_kind text, p_person uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare se public.session; me public.session_assignment; v_id uuid; who text; what text;
begin
  select * into se from public.session where id = p_session;
  me := public.my_assignment(p_session);
  if se.id is null or me.session_id is null or me.status = 'absent' or not public.is_active_person() then
    raise exception 'only a musician playing this date can ask for a change' using errcode = '42501';
  end if;
  if se.schedule_state = 'canceled' then
    raise exception 'this date is already "No Program"' using errcode = '23514';
  end if;
  if p_kind = 'sub' then
    if p_person is null or not public.is_on_current_roster(se.residency_id, p_person) then
      raise exception 'pick a sub on this season''s roster' using errcode = '23514';
    end if;
    if exists (select 1 from public.session_assignment where session_id = p_session and person_id = p_person and status <> 'absent') then
      raise exception 'they''re already playing this date' using errcode = '23514';
    end if;
  elsif p_kind = 'other' then
    if nullif(btrim(coalesce(p_note, '')), '') is null then
      raise exception 'say what should change' using errcode = '23514';
    end if;
    p_person := null;
  else
    raise exception 'unknown kind of request' using errcode = '22023';
  end if;
  insert into public.change_request (session_id, kind, requested_by, proposed_person_id, note)
  values (p_session, p_kind, (select auth.uid()), p_person, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  select name into who from public.person where id = (select auth.uid());
  what := case when p_kind = 'sub' then 'a sub: ' || (select name from public.person where id = p_person) else 'a change' end;
  perform public.notify_point_people(se.residency_id, 'change_requested',
    'Change to approve: ' || public.session_label(p_session),
    coalesce(who, 'A musician') || ' asks for ' || what || ' on ' || public.session_label(p_session) || '.' ||
    coalesce(chr(10) || 'Note: ' || nullif(btrim(coalesce(p_note, '')), ''), '') || chr(10) || 'Approve or decline it in To do.',
    'change_requested:' || v_id);
  return v_id;
end;
$$;
revoke all on function public.request_change(uuid, text, uuid, text) from public, anon;
grant execute on function public.request_change(uuid, text, uuid, text) to authenticated;

create function public.withdraw_change_request(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.change_request set status = 'withdrawn', decided_at = now()
   where id = p_request and requested_by = (select auth.uid()) and status = 'open';
  if not found then
    raise exception 'only your own open request can be withdrawn' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.withdraw_change_request(uuid) from public, anon;
grant execute on function public.withdraw_change_request(uuid) to authenticated;

create function public.decide_change_request(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare cr public.change_request; se public.session; mine public.session_assignment;
begin
  select * into cr from public.change_request where id = p_request for update;
  select * into se from public.session where id = cr.session_id;
  if cr.id is null or not public.can_schedule(se.residency_id) then
    raise exception 'only the point person or an admin decides requests' using errcode = '42501';
  end if;
  if cr.status <> 'open' then
    raise exception 'this request has already been decided' using errcode = '23514';
  end if;
  if p_approve then
    perform set_config('iris.month_action', 'on', true);
    if cr.kind = 'leader_swap' then
      if not exists (select 1 from public.session_assignment where session_id = se.id and person_id = cr.proposed_person_id and status <> 'absent') then
        raise exception 'they''re no longer playing this date' using errcode = '23514';
      end if;
      update public.session_assignment set role = 'participant' where session_id = se.id and role = 'leader' and status <> 'absent';
      update public.session_assignment set role = 'leader' where session_id = se.id and person_id = cr.proposed_person_id and status <> 'absent';
    elsif cr.kind = 'sub' then
      select * into mine from public.session_assignment where session_id = se.id and person_id = cr.requested_by;
      update public.session_assignment set status = 'absent', role = 'participant' where session_id = se.id and person_id = cr.requested_by;
      insert into public.session_assignment (session_id, person_id, role, status, substitute_for_id)
      values (se.id, cr.proposed_person_id, coalesce(mine.role, 'participant'), 'substitute', cr.requested_by)
      on conflict (session_id, person_id) do update
        set role = excluded.role, status = 'substitute', substitute_for_id = excluded.substitute_for_id;
    end if;
    perform set_config('iris.month_action', 'off', true);
  end if;
  update public.change_request
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = cr.id;
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'change_decided', p.id, p.email,
         left((case when p_approve then 'Approved: ' else 'Declined: ' end) || public.session_label(se.id), 300),
         'Your request for ' || public.session_label(se.id) || ' was ' || case when p_approve then 'approved' else 'declined' end || '.' ||
         coalesce(chr(10) || 'Note: ' || nullif(btrim(coalesce(p_note, '')), ''), ''),
         'change_decided:' || cr.id
  from public.person p where p.id = cr.requested_by and p.active
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function public.decide_change_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_change_request(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Absences
-- ---------------------------------------------------------------------------

-- "I can't play" (before the 10th, on the date in the calendar). No approval,
-- no limit for now. Returns how many dates they've marked this season.
create function public.set_unavailable(p_session uuid, p_unavailable boolean)
returns integer language plpgsql security definer set search_path = ''
as $$
declare se public.session; sm public.schedule_month; me public.session_assignment; used integer; who text;
begin
  select * into se from public.session where id = p_session;
  me := public.my_assignment(p_session);
  if se.id is null or me.session_id is null or me.status = 'substitute' or not public.is_active_person() then
    raise exception 'only a musician on this date can mark it' using errcode = '42501';
  end if;
  sm := public.session_schedule_month(p_session);
  if sm.stage is distinct from 'team_editing' or se.schedule_state <> 'draft' then
    raise exception 'dates you can''t play are marked while the month is open for the team; after that, call the point person' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  if p_unavailable then
    update public.session_assignment set status = 'absent' where session_id = p_session and person_id = me.person_id;
  else
    update public.session_assignment
       set status = 'assigned',
           role = case when role = 'leader' and exists (select 1 from public.session_assignment o where o.session_id = p_session
                         and o.person_id <> me.person_id and o.role = 'leader' and o.status <> 'absent') then 'participant' else role end
     where session_id = p_session and person_id = me.person_id;
  end if;
  perform set_config('iris.month_action', 'off', true);
  if p_unavailable and me.status <> 'absent' then
    select name into who from public.person where id = me.person_id;
    perform public.notify_point_people(se.residency_id, 'absence_marked',
      coalesce(who, 'A musician') || ' can''t play ' || public.session_label(p_session),
      coalesce(who, 'A musician') || ' marked that they can''t play ' || public.session_label(p_session) || '.' || chr(10) ||
      'Find cover, or make the date "No Program".' ||
      case when me.role = 'leader' then chr(10) || 'They were leading it, so it needs a new leader.' else '' end,
      'absence_marked:' || p_session || ':' || me.person_id || ':' || extract(epoch from now())::bigint);
  end if;
  select count(*) into used from public.session_assignment a join public.session s2 on s2.id = a.session_id
   join public.season sn on sn.residency_id = s2.residency_id and s2.starts_at::date between sn.starts_on and sn.ends_on
   where a.person_id = me.person_id and a.status = 'absent' and s2.residency_id = se.residency_id
     and se.starts_at::date between sn.starts_on and sn.ends_on;
  return used;
end;
$$;
revoke all on function public.set_unavailable(uuid, boolean) from public, anon;
grant execute on function public.set_unavailable(uuid, boolean) to authenticated;

-- "I wasn't there": the program went on without them. Counts at once (not
-- paid for it, not billed for them). Refused once the week is approved.
create function public.mark_not_there(p_session uuid, p_not_there boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare se public.session; me public.session_assignment; who text;
begin
  select * into se from public.session where id = p_session;
  me := public.my_assignment(p_session);
  if se.id is null or me.session_id is null or not public.is_active_person() then
    raise exception 'only a musician on this date can mark it' using errcode = '42501';
  end if;
  if se.starts_at > now() then
    raise exception 'this date hasn''t happened yet; mark dates you can''t play in the calendar' using errcode = '23514';
  end if;
  if se.schedule_state = 'canceled' then
    raise exception 'this date was "No Program"' using errcode = '23514';
  end if;
  if public.is_session_in_approved_week(p_session) then
    raise exception 'this week is approved; ask the point person to correct it' using errcode = '23514';
  end if;
  if p_not_there and me.role = 'leader' and exists (select 1 from public.session_report where session_id = p_session) then
    raise exception 'you documented this date as its leader; ask the point person to correct it' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  if p_not_there then
    update public.session_assignment set status = 'absent', role = 'participant' where session_id = p_session and person_id = me.person_id;
  else
    update public.session_assignment set status = case when substitute_for_id is null then 'assigned' else 'substitute' end
     where session_id = p_session and person_id = me.person_id;
  end if;
  perform set_config('iris.month_action', 'off', true);
  if p_not_there and me.status <> 'absent' then
    select name into who from public.person where id = me.person_id;
    perform public.notify_point_people(se.residency_id, 'not_there',
      coalesce(who, 'A musician') || ' wasn''t at ' || public.session_label(p_session),
      coalesce(who, 'A musician') || ' marked that they weren''t at ' || public.session_label(p_session) || '. They aren''t paid for it, and the partner isn''t billed for them.' ||
      case when me.role = 'leader' then chr(10) || 'They were its leader: whoever played and documents it becomes the leader.' else '' end,
      'not_there:' || p_session || ':' || me.person_id || ':' || extract(epoch from now())::bigint);
  end if;
end;
$$;
revoke all on function public.mark_not_there(uuid, boolean) from public, anon;
grant execute on function public.mark_not_there(uuid, boolean) to authenticated;

-- The leader wasn't there: the first musician who played and documents it becomes its leader.
create function public.take_lead_to_document(p_session uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare se public.session; me public.session_assignment;
begin
  select * into se from public.session where id = p_session;
  me := public.my_assignment(p_session);
  if se.id is null or me.session_id is null or me.status = 'absent' or not public.is_active_person() then
    raise exception 'only a musician who played this date can document it' using errcode = '42501';
  end if;
  if se.kind <> 'group_session' or se.schedule_state = 'canceled' or se.starts_at > now() then
    raise exception 'this date can''t be documented' using errcode = '23514';
  end if;
  if exists (select 1 from public.session_assignment where session_id = p_session and role = 'leader' and status <> 'absent') then
    raise exception 'this date has a leader; they document it' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  update public.session_assignment set role = 'leader' where session_id = p_session and person_id = me.person_id;
  perform set_config('iris.month_action', 'off', true);
end;
$$;
revoke all on function public.take_lead_to_document(uuid) from public, anon;
grant execute on function public.take_lead_to_document(uuid) to authenticated;

-- "Canceled day-of": after calling the point person, the leader records it
-- instead of documenting. Reason required. For billing it counts as made at
-- the date's start time (Lauren, Nov 23, 2026).
create function public.cancel_day_of(p_session uuid, p_reason public.cancellation_reason)
returns void language plpgsql security definer set search_path = ''
as $$
declare se public.session; tz text;
begin
  select * into se from public.session where id = p_session;
  if se.id is null or not (public.is_session_leader(p_session) or public.can_schedule(se.residency_id)) then
    raise exception 'the date''s leader records a day-of cancellation' using errcode = '42501';
  end if;
  if p_reason is null then
    raise exception 'pick why it was canceled' using errcode = '23514';
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id where l.id = se.location_id;
  if (se.starts_at at time zone coalesce(tz, 'America/New_York'))::date > (now() at time zone coalesce(tz, 'America/New_York'))::date then
    raise exception 'a day-of cancellation is recorded on the day or after; for later dates, call the point person' using errcode = '23514';
  end if;
  if se.schedule_state = 'canceled' then
    raise exception 'this date is already "No Program"' using errcode = '23514';
  end if;
  if exists (select 1 from public.session_report where session_id = p_session) then
    raise exception 'this date has already been documented' using errcode = '23514';
  end if;
  if public.is_session_in_approved_week(p_session) then
    raise exception 'this week is approved; ask the point person to correct it' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  perform set_config('iris.publishing', 'on', true);
  update public.session set schedule_state = 'canceled', cancellation_reason = p_reason, canceled_at = se.starts_at
   where id = p_session;
  perform set_config('iris.publishing', 'off', true);
  perform set_config('iris.month_action', 'off', true);
end;
$$;
revoke all on function public.cancel_day_of(uuid, public.cancellation_reason) from public, anon;
grant execute on function public.cancel_day_of(uuid, public.cancellation_reason) to authenticated;

-- The cancellation time is stamped by the database (K3 fix), except by
-- cancel_day_of, which records the date's start time (Lauren, Nov 23).
create or replace function public.session_canceled_at_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return new;
  end if;
  if (select auth.uid()) is not null and new.schedule_state = 'canceled' then
    if old.schedule_state is distinct from 'canceled' then
      new.canceled_at := now();
    else
      new.canceled_at := old.canceled_at;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaders: musicians propose, the point person decides (revises v0.18/v0.25)
-- ---------------------------------------------------------------------------

create or replace function public.assignment_month_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month; se public.session;
begin
  if (select auth.uid()) is null or coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select * into se from public.session where id = coalesce(new.session_id, old.session_id);
  -- Setting or changing a leader: the point person, admins and the Admin Lead only.
  if ((tg_op = 'INSERT' and new.role = 'leader')
      or (tg_op = 'UPDATE' and new.role is distinct from old.role and (new.role = 'leader' or old.role = 'leader'))
      or (tg_op = 'DELETE' and old.role = 'leader' and old.status <> 'absent'))
     and se.id is not null and not public.can_schedule(se.residency_id) and not public.is_current_admin_lead(se.residency_id)
     -- Recording one's own sub before the month is final (D11) hands the leader role to the sub.
     and not (tg_op = 'INSERT' and new.status = 'substitute')
     and not (tg_op = 'UPDATE' and new.status = 'absent' and old.role = 'leader' and new.person_id = (select auth.uid())) then
    raise exception 'propose a leader swap; the point person approves it' using errcode = '42501';
  end if;
  sm := public.session_schedule_month(se.id);
  if sm.id is null then return coalesce(new, old); end if;
  if sm.stage = 'final' and not public.can_schedule(sm.residency_id) then
    raise exception 'this month is final; ask the point person for changes' using errcode = '42501';
  end if;
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- To do (never stored)
-- ---------------------------------------------------------------------------

create function public.my_tasks()
returns table (kind text, title text, detail text, due_on date, residency_id uuid, site_id uuid, month date,
               session_id uuid, request_id uuid)
language sql stable security definer set search_path = ''
as $$
  with me as (select p.id from public.person p where p.id = (select auth.uid()) and p.active),
  pp as (select sa.residency_id from public.staff_assignment sa, me
          where sa.person_id = me.id and sa.role = 'point_person'
            and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)),
  al as (select distinct s.residency_id from public.roster_member rm join public.season s on s.id = rm.season_id, me
          where rm.person_id = me.id and rm.is_admin_lead and s.ends_on >= current_date
            and (rm.left_on is null or rm.left_on >= current_date)),
  months as (select sm.*, st.display_name as site_name, r.name as residency_name, to_char(sm.month, 'FMMonth') as month_name
               from public.schedule_month sm join public.site st on st.id = sm.site_id join public.residency r on r.id = sm.residency_id
              where sm.month >= date_trunc('month', current_date)::date),
  mine as (select se.id, se.residency_id, se.title, se.series_id, se.starts_at, se.kind, se.schedule_state,
                  st.id as site_id, st.timezone, a.role, a.status
             from public.session_assignment a join me on me.id = a.person_id
             join public.session se on se.id = a.session_id
             join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id)
  -- Point person: open next month
  select 'open_month', 'Open ' || to_char(date_trunc('month', current_date + interval '1 month'), 'FMMonth') || ' for the team',
         r.name, date_trunc('month', current_date)::date, r.id, null::uuid,
         date_trunc('month', current_date + interval '1 month')::date, null::uuid, null::uuid
    from pp join public.residency r on r.id = pp.residency_id and r.status = 'active'
   where exists (select 1 from public.residency_site rs where rs.residency_id = r.id
                  and not exists (select 1 from public.schedule_month sm where sm.residency_id = r.id and sm.site_id = rs.site_id
                                    and sm.month = date_trunc('month', current_date + interval '1 month')::date))
  union all
  -- Leaders: titles while the team edits
  select 'titles', 'Add titles to the ' || m.month_name || ' dates you lead',
         m.site_name || ': ' || count(*) || ' still ' || case when count(*) = 1 then 'has' else 'have' end || ' the usual title',
         m.team_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join mine x on x.residency_id = m.residency_id and x.site_id = m.site_id
     and date_trunc('month', x.starts_at at time zone x.timezone)::date = m.month
    join public.series sr on sr.id = x.series_id
   where m.stage = 'team_editing' and x.role = 'leader' and x.status <> 'absent' and x.schedule_state = 'draft' and x.title = sr.title
   group by m.month_name, m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month
  union all
  -- Point person: review and confirm
  select 'confirm', 'Review and confirm ' || m.month_name, m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join pp on pp.residency_id = m.residency_id where m.stage = 'team_editing'
  union all
  -- Point person: someone can't play a draft date
  select 'cover', p.name || ' can''t play ' || to_char(se.starts_at at time zone st.timezone, 'FMDy FMMon FMDD'),
         se.title || ', ' || st.display_name || '. Find cover, or make it "No Program".',
         m.team_due_on, se.residency_id, st.id, m.month, se.id, null
    from months m join pp on pp.residency_id = m.residency_id
    join public.session se on se.residency_id = m.residency_id and se.schedule_state = 'draft'
    join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id and st.id = m.site_id
    join public.session_assignment a on a.session_id = se.id and a.status = 'absent'
    join public.person p on p.id = a.person_id
   where m.stage in ('team_editing', 'team_confirmed')
     and date_trunc('month', se.starts_at at time zone st.timezone)::date = m.month
     and not exists (select 1 from public.session_assignment s2 where s2.session_id = se.id and s2.substitute_for_id = a.person_id)
  union all
  -- Point person: requests to decide
  select 'approve', case cr.kind when 'leader_swap' then 'Approve leader swap' when 'sub' then 'Approve a sub' else 'Approve a change' end,
         public.session_label(se.id) || ': ' || rq.name ||
         case cr.kind when 'leader_swap' then ' proposes ' || pr.name || ' as leader'
                      when 'sub' then ' asks for ' || pr.name || ' as sub' else ' asks: ' || coalesce(cr.note, '') end,
         current_date, se.residency_id, null, null, se.id, cr.id
    from public.change_request cr join public.session se on se.id = cr.session_id
    join pp on pp.residency_id = se.residency_id
    join public.person rq on rq.id = cr.requested_by left join public.person pr on pr.id = cr.proposed_person_id
   where cr.status = 'open'
  union all
  -- Admin Lead: send, enter partner changes, mark final
  select 'send', 'Send ' || m.month_name || ' to the partner', m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('team_editing', 'team_confirmed')
  union all
  select 'partner_changes', 'Enter partner changes for ' || m.month_name, m.site_name, m.final_due_on, m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('sent_to_partner', 'partner_changes')
  union all
  select 'finalize', 'Mark ' || m.month_name || ' final', m.site_name || ': sends the final calendar and locks it', m.final_due_on,
         m.residency_id, m.site_id, m.month, null, null
    from months m join al on al.residency_id = m.residency_id where m.stage in ('sent_to_partner', 'partner_changes')
  union all
  -- Musicians: document programs they led (last four weeks)
  select 'document', 'Document ' || x.title, to_char(x.starts_at at time zone x.timezone, 'FMDay, FMMonth FMDD'),
         public.week_monday((x.starts_at at time zone x.timezone)::date) + 8, x.residency_id, x.site_id, null, x.id, null
    from mine x
   where x.kind = 'group_session' and x.role = 'leader' and x.status <> 'absent' and x.schedule_state <> 'canceled'
     and x.starts_at <= now() and x.starts_at > now() - interval '28 days'
     and not exists (select 1 from public.session_report sr where sr.session_id = x.id)
  union all
  -- Musicians: submit last week
  select 'submit_week', 'Submit your week', r.name || ', week of ' || to_char(public.week_monday(current_date - 7), 'FMMonth FMDD'),
         public.week_monday(current_date) + 1, r.id, null, null, null, null
    from public.residency r, me,
         lateral public.missing_work_internal(r.id, public.week_monday(current_date - 7)) mw
   where mw.person_id = me.id and mw.documented_minutes > 0 and mw.hours_state in ('none', 'draft')
     and public.is_on_current_roster(r.id, me.id)
  order by 4, 2;
$$;
revoke all on function public.my_tasks() from public, anon;
grant execute on function public.my_tasks() to authenticated;

-- ---------------------------------------------------------------------------
-- Email reminders paired with tasks (the scheduler calls this, like
-- queue_deadline_reminders). Each goes out once.
-- ---------------------------------------------------------------------------

create function public.queue_month_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; c integer; today date := (p_now at time zone 'America/New_York')::date;
begin
  -- The day before the 10th: leaders with usual titles; point people to confirm.
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select distinct on (p.id, sm.id) 'month_reminder', p.id, p.email,
         'Reminder: add titles to your ' || to_char(sm.month, 'FMMonth') || ' dates at ' || st.display_name,
         'By ' || to_char(sm.team_due_on, 'FMDay, FMMonth FMDD') || ', add a title to each ' || to_char(sm.month, 'FMMonth') ||
         ' date you lead at ' || st.display_name || ', and mark any date you can''t play.',
         'month_reminder:titles:' || sm.id || ':' || p.id
    from public.schedule_month sm join public.site st on st.id = sm.site_id
    join public.session se on se.residency_id = sm.residency_id and se.schedule_state = 'draft'
    join public.location l on l.id = se.location_id and l.site_id = sm.site_id
    join public.series sr on sr.id = se.series_id and sr.title = se.title
    join public.session_assignment a on a.session_id = se.id and a.role = 'leader' and a.status <> 'absent'
    join public.person p on p.id = a.person_id and p.active
   where sm.stage = 'team_editing' and today = sm.team_due_on - 1
     and date_trunc('month', se.starts_at at time zone st.timezone)::date = sm.month
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'month_reminder', p.id, p.email,
         'Reminder: confirm ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name,
         'The team''s ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name || ' is due ' ||
         to_char(sm.team_due_on, 'FMDay, FMMonth FMDD') || '. Review and confirm it in To do.',
         'month_reminder:confirm:' || sm.id || ':' || p.id
    from public.schedule_month sm join public.site st on st.id = sm.site_id
    join public.staff_assignment sa on sa.residency_id = sm.residency_id and sa.role = 'point_person'
     and sa.starts_on <= today and (sa.ends_on is null or sa.ends_on >= today)
    join public.person p on p.id = sa.person_id and p.active
   where sm.stage = 'team_editing' and today = sm.team_due_on - 1
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- The Admin Lead: send on the 10th; mark final the day before the 15th.
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'month_reminder', p.id, p.email,
         case when sm.stage in ('team_editing', 'team_confirmed')
              then 'Today: send ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name || ' to the partner'
              else 'Tomorrow: mark ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name || ' final' end,
         case when sm.stage in ('team_editing', 'team_confirmed')
              then 'Send the draft calendar to the partner today, from To do.'
              else 'Enter any partner changes, then mark the month final by ' || to_char(sm.final_due_on, 'FMDay, FMMonth FMDD') || '. That sends the final calendar.' end,
         'month_reminder:' || case when sm.stage in ('team_editing', 'team_confirmed') then 'send' else 'final' end || ':' || sm.id || ':' || p.id
    from public.schedule_month sm join public.site st on st.id = sm.site_id
    join public.season sn on sn.residency_id = sm.residency_id and sn.ends_on >= today
    join public.roster_member rm on rm.season_id = sn.id and rm.is_admin_lead and (rm.left_on is null or rm.left_on >= today)
    join public.person p on p.id = rm.person_id and p.active
   where (sm.stage in ('team_editing', 'team_confirmed') and today = sm.team_due_on)
      or (sm.stage in ('sent_to_partner', 'partner_changes') and today = sm.final_due_on - 1)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;
revoke all on function public.queue_month_reminders(timestamptz) from public, anon, authenticated;
