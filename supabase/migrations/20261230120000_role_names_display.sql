-- v0.9 names (D19-i, Nov 27, 2026): the screens and messages say "Iris Supervisor"
-- for the point person and "Lead Musician" for the admin lead. Text only: every
-- function below is its latest definition re-created with the new wording in its
-- messages, tasks and emails. Identifiers (point_person, is_admin_lead) don't change.

create or replace function public.mark_month_reviewed(p_residency uuid, p_site uuid, p_month date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the Iris Supervisor or an admin can mark a month reviewed' using errcode = '42501';
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

create or replace function public.publish_month(p_residency uuid, p_site uuid, p_month date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; v public.calendar_export%rowtype; missing integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and version = 1;
  if not found then
    raise exception 'the Iris Supervisor must mark this month reviewed first' using errcode = '23514';
  end if;
  if v.state = 'sent' then
    raise exception 'this month is already published; download an updated version instead' using errcode = '23514';
  end if;
  select count(*) into missing from public.month_sessions(p_residency, p_site, m) ms(id)
   join public.session se on se.id = ms.id
   where se.schedule_state <> 'canceled' and se.kind = 'group_session'
     and (select count(*) from public.session_assignment sa
          where sa.session_id = se.id and sa.role = 'leader' and sa.status <> 'absent') <> 1;
  if missing > 0 then
    raise exception '% group session(s) still need a leader', missing using errcode = '23514';
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

create or replace function public.time_entry_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'UPDATE' and old.state = 'approved' then
      raise exception 'approved hours are locked' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.state = 'submitted' and new.hours is distinct from old.hours then
      raise exception 'these hours are submitted; ask the Iris Supervisor to send them back to change them' using errcode = '42501';
    end if;
    if new.state = 'approved' then
      raise exception 'only the Iris Supervisor approves hours' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.person_id <> old.person_id or new.residency_id <> old.residency_id
                           or new.week_starting <> old.week_starting or new.time_category_id <> old.time_category_id) then
    raise exception 'start a new entry instead' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.return_week(p_person uuid, p_residency uuid, p_week date, p_note text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the Iris Supervisor or an admin sends hours back' using errcode = '42501';
  end if;
  update public.time_entry set state = 'draft', submitted_at = null, returned_note = nullif(btrim(p_note), '')
   where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.save_site_contact(p_site uuid, p_contact uuid, p_name text, p_title text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare cid uuid := p_contact;
begin
  if not public.can_plan_site(p_site) then
    raise exception 'only the Iris Supervisor or an admin changes community contacts' using errcode = '42501';
  end if;
  if cid is null then
    insert into public.partner_contact (partner_id, name, title, email, phone)
    select s.partner_id, btrim(p_name), nullif(btrim(p_title), ''), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), '')
    from public.site s where s.id = p_site
    returning id into cid;
    insert into public.partner_contact_site (contact_id, site_id) values (cid, p_site);
  else
    if not exists (select 1 from public.partner_contact_site where contact_id = cid and site_id = p_site) then
      raise exception 'that contact isn''t at this building' using errcode = '42501';
    end if;
    update public.partner_contact
       set name = btrim(p_name), title = nullif(btrim(p_title), ''), email = nullif(lower(btrim(p_email)), ''), phone = nullif(btrim(p_phone), '')
     where id = cid;
  end if;
  return cid;
end;
$$;

create or replace function public.retire_site_contact(p_site uuid, p_contact uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_plan_site(p_site) then
    raise exception 'only the Iris Supervisor or an admin changes community contacts' using errcode = '42501';
  end if;
  update public.partner_contact set active = false
   where id = p_contact and exists (select 1 from public.partner_contact_site where contact_id = p_contact and site_id = p_site);
end;
$$;

create or replace function public.approve_week(p_person uuid, p_residency uuid, p_week date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer; waiting text;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the Iris Supervisor or an admin approves hours' using errcode = '42501';
  end if;
  select string_agg(distinct coalesce(u.leader_name, 'its leader'), ', ') into waiting
    from public.undocumented_played_sessions(p_person, p_residency, p_week) u;
  if waiting is not null then
    raise exception 'a program from this week is waiting for documentation from %', waiting using errcode = '23514';
  end if;
  if exists (select 1 from public.time_entry where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted') then
    perform public.refresh_week_hours(p_person, p_residency, p_week, 'submitted');
  end if;
  update public.time_entry set state = 'approved', approved_by = (select auth.uid()), approved_at = now(), returned_note = null
   where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.notify_no_program()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  tz text;
  who text;
  label text;
begin
  if coalesce(current_setting('iris.auto_no_program', true), '') = 'on' then
    return new;
  end if;
  select st.timezone into tz from public.location l join public.site st on st.id = l.site_id where l.id = new.location_id;
  select p.name into who from public.person p where p.id = (select auth.uid());
  label := to_char(new.starts_at at time zone coalesce(tz, 'America/New_York'), 'FMDay, FMMonth FMDD') ||
           case when new.has_set_time then ' at ' || to_char(new.starts_at at time zone coalesce(tz, 'America/New_York'), 'FMHH12:MI AM') else '' end;
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'no_program', p.id, p.email,
         'No Program: ' || new.title || ', ' || label,
         coalesce(who, 'Someone') || ' changed ' || new.title || ' on ' || label || ' (' || r.name || ') to "No Program".' || chr(10) ||
         'Reason: ' || initcap(coalesce(new.cancellation_reason::text, 'not given')) || '.' || chr(10) || chr(10) ||
         'You''re getting this because you''re the Iris Supervisor for ' || r.name || '.',
         'no_program:' || new.id || ':' || p.id || ':' || extract(epoch from coalesce(new.canceled_at, now()))::bigint
  from public.staff_assignment sa
  join public.person p on p.id = sa.person_id and p.active
  join public.residency r on r.id = new.residency_id
  where sa.residency_id = new.residency_id and sa.role = 'point_person'
    and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    and p.id is distinct from (select auth.uid())
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.mark_schedule_checked(p_residency uuid, p_site uuid, p_month date)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  m date := date_trunc('month', p_month)::date;
  site_name text; residency_name text; month_label text; names text;
  all_done boolean;
begin
  if me is null or not public.is_on_current_roster(p_residency) then
    raise exception 'only musicians on this program''s roster can do this' using errcode = '42501';
  end if;
  if not exists (select 1 from public.month_players(p_residency, p_site, m) p where p = me) then
    raise exception 'you aren''t playing at this building this month' using errcode = '23514';
  end if;
  if exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m) then
    raise exception 'this month has already been reviewed' using errcode = '23514';
  end if;
  insert into public.schedule_check (residency_id, site_id, month, person_id)
  values (p_residency, p_site, m, me)
  on conflict (residency_id, site_id, month, person_id) do update set checked_at = now(), changed_at = null;

  select not exists (
    select 1 from public.month_players(p_residency, p_site, m) p
    where not exists (select 1 from public.schedule_check c
                      where c.residency_id = p_residency and c.site_id = p_site and c.month = m and c.person_id = p))
    into all_done;
  if all_done then
    select display_name into site_name from public.site where id = p_site;
    select name into residency_name from public.residency where id = p_residency;
    month_label := to_char(m, 'FMMonth YYYY');
    select string_agg(split_part(pe.name, ' ', 1), ', ' order by pe.name) into names
      from public.month_players(p_residency, p_site, m) p join public.person pe on pe.id = p;
    insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
    select 'schedule_checked', p.id, p.email,
           site_name || ', ' || month_label || ': musicians are done reviewing',
           'Everyone playing at ' || site_name || ' in ' || month_label || ' (' || residency_name || ') has checked their dates: ' || names || '.' || chr(10) || chr(10) ||
           'Next: set any missing leaders, review the month with the Lead Musician, and mark it reviewed.' || chr(10) || chr(10) ||
           'You''re getting this because you''re the Iris Supervisor for ' || residency_name || '.',
           'schedule_checked:' || p_residency || ':' || p_site || ':' || m || ':' || p.id
    from public.staff_assignment sa
    join public.person p on p.id = sa.person_id and p.active
    where sa.residency_id = p_residency and sa.role = 'point_person'
      and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    on conflict (dedupe_key) do nothing;
  end if;
  return all_done;
end;
$$;

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
      -- The Lead Musician updating a published date after partner feedback.
      if new.series_id is distinct from old.series_id
         or new.kind is distinct from old.kind
         or new.has_set_time is distinct from old.has_set_time
         or new.is_special_event is distinct from old.is_special_event
         or new.is_extra is distinct from old.is_extra
         or new.billable is distinct from old.billable then
        raise exception 'the Lead Musician can change a published date''s time, room, title and notes, or make it "No Program"'
          using errcode = '42501';
      end if;
    elsif not planner then
      -- Locked after review (v0.25): musicians ask the Iris Supervisor. The
      -- Lead Musician keeps working on the month (step 5: dates added after
      -- partner feedback go out with the next calendar version).
      if public.is_session_month_reviewed(old.id) and not public.is_current_admin_lead(old.residency_id) then
        raise exception 'this month has been reviewed; ask the Iris Supervisor for changes' using errcode = '42501';
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

create or replace function public.session_assignment_review_lock()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare se public.session;
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  select * into se from public.session where id = coalesce(new.session_id, old.session_id);
  if se.id is not null and se.schedule_state = 'draft'
     and not public.can_schedule(se.residency_id)
     and not public.is_current_admin_lead(se.residency_id)
     and public.is_session_month_reviewed(se.id) then
    raise exception 'this month has been reviewed; ask the Iris Supervisor for changes' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.notify_point_people(p_residency uuid, p_kind text, p_subject text, p_body text, p_dedupe text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select p_kind, p.id, p.email, left(p_subject, 300),
         p_body || chr(10) || chr(10) || 'You''re getting this because you''re the Iris Supervisor for ' || r.name || '.',
         p_dedupe || ':' || p.id
  from public.staff_assignment sa
  join public.person p on p.id = sa.person_id and p.active
  join public.residency r on r.id = sa.residency_id
  where sa.residency_id = p_residency and sa.role = 'point_person'
    and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)
    and p.id is distinct from (select auth.uid())
  on conflict (dedupe_key) do nothing;
$$;

create or replace function public.confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the Iris Supervisor or an admin can confirm a month' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage <> 'team_editing' then
    raise exception 'this month is already past team editing' using errcode = '23514';
  end if;
  -- Calendar version 1, "reviewed": the existing lock for musicians (v0.25).
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at)
  select p_residency, p_site, m, 1, 'reviewed', (select auth.uid()), now()
  where not exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m);
  update public.schedule_month set stage = 'team_confirmed', confirmed_at = now(), confirmed_by = (select auth.uid()), updated_at = now()
   where id = sm.id;
end;
$$;

create or replace function public.undo_confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the Iris Supervisor or an admin can undo confirming' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage <> 'team_confirmed' then
    raise exception 'only a confirmed month that hasn''t been sent can be reopened' using errcode = '23514';
  end if;
  delete from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and version = 1 and state = 'reviewed';
  update public.schedule_month set stage = 'team_editing', confirmed_at = null, confirmed_by = null, updated_at = now()
   where id = sm.id;
end;
$$;

create or replace function public.send_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month; v_export uuid;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'only the Lead Musician, the Iris Supervisor or an admin can send the calendar' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage not in ('team_editing', 'team_confirmed') then
    raise exception 'this month''s calendar has already been sent' using errcode = '23514';
  end if;
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at)
  select p_residency, p_site, m, 1, 'reviewed', (select auth.uid()), now()
  where not exists (select 1 from public.calendar_export where residency_id = p_residency and site_id = p_site and month = m);
  perform set_config('iris.month_action', 'on', true);
  v_export := public.publish_month(p_residency, p_site, m);
  perform set_config('iris.month_action', 'off', true);
  update public.schedule_month
     set stage = 'sent_to_partner', sent_at = now(), sent_by = (select auth.uid()),
         confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, (select auth.uid())),
         updated_at = now()
   where id = sm.id;
  return jsonb_build_object('export_id', v_export, 'version', 1, 'final', false)
         || public.calendar_recipients(p_residency, p_site);
end;
$$;

create or replace function public.finalize_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; sm public.schedule_month; v_export uuid; v_version integer;
begin
  if not (public.can_schedule(p_residency) or public.is_current_admin_lead(p_residency)) then
    raise exception 'only the Lead Musician, the Iris Supervisor or an admin can mark a month final' using errcode = '42501';
  end if;
  sm := public.require_schedule_month(p_residency, p_site, m);
  if sm.stage not in ('sent_to_partner', 'partner_changes') then
    raise exception 'send the calendar to the partner before marking the month final' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  if sm.stage = 'partner_changes' or exists (
       select 1 from public.month_sessions(p_residency, p_site, m) ms(id)
       join public.session se on se.id = ms.id where se.schedule_state = 'draft') then
    v_export := public.new_calendar_version(p_residency, p_site, m, null);
  end if;
  perform set_config('iris.month_action', 'off', true);
  select id, version into v_export, v_version from public.calendar_export
   where residency_id = p_residency and site_id = p_site and month = m and state = 'sent'
   order by version desc limit 1;
  update public.schedule_month set stage = 'final', finalized_at = now(), finalized_by = (select auth.uid()), updated_at = now()
   where id = sm.id;
  return jsonb_build_object('export_id', v_export, 'version', v_version, 'final', true)
         || public.calendar_recipients(p_residency, p_site);
end;
$$;

create or replace function public.session_month_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month; rid uuid := coalesce(new.residency_id, old.residency_id);
begin
  if (select auth.uid()) is null or coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    select m.* into sm from public.location l join public.site st on st.id = l.site_id
      join public.schedule_month m on m.residency_id = new.residency_id and m.site_id = st.id
       and m.month = date_trunc('month', new.starts_at at time zone st.timezone)::date
     where l.id = new.location_id;
  else
    sm := public.session_schedule_month(old.id);
  end if;
  if sm.stage = 'final' and not public.can_schedule(rid) then
    raise exception 'this month is final; ask the Iris Supervisor for changes' using errcode = '42501';
  end if;
  -- Titles while the team edits: only the date's leader (v0.41, Q1).
  if tg_op = 'UPDATE' and new.title is distinct from old.title and old.schedule_state = 'draft'
     and not public.can_schedule(rid)
     and (sm.stage = 'team_editing' or (sm.id is null and not public.is_session_month_reviewed(old.id)))
     and not public.is_session_leader(old.id) then
    raise exception 'only this date''s leader changes its title' using errcode = '42501';
  end if;
  -- The first change after sending: partner changes.
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.assignment_month_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sm public.schedule_month; se public.session;
begin
  if (select auth.uid()) is null or coalesce(current_setting('iris.month_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select * into se from public.session where id = coalesce(new.session_id, old.session_id);
  -- Setting or changing a leader: the Iris Supervisor, admins and the Lead Musician only.
  if ((tg_op = 'INSERT' and new.role = 'leader')
      or (tg_op = 'UPDATE' and new.role is distinct from old.role and (new.role = 'leader' or old.role = 'leader'))
      or (tg_op = 'DELETE' and old.role = 'leader' and old.status <> 'absent'))
     and se.id is not null and not public.can_schedule(se.residency_id) and not public.is_current_admin_lead(se.residency_id)
     -- Recording one's own sub before the month is final (D11) hands the leader role to the sub.
     and not (tg_op = 'INSERT' and new.status = 'substitute')
     and not (tg_op = 'UPDATE' and new.status = 'absent' and old.role = 'leader' and new.person_id = (select auth.uid())) then
    raise exception 'propose a leader swap; the Iris Supervisor approves it' using errcode = '42501';
  end if;
  sm := public.session_schedule_month(se.id);
  if sm.id is null then return coalesce(new, old); end if;
  if sm.stage = 'final' and not public.can_schedule(sm.residency_id) then
    raise exception 'this month is final; ask the Iris Supervisor for changes' using errcode = '42501';
  end if;
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.request_leader_swap(p_session uuid, p_person uuid, p_note text default null)
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
    raise exception 'this month is past team editing; ask the Iris Supervisor' using errcode = '23514';
  end if;
  if not exists (select 1 from public.session_assignment where session_id = p_session and role = 'leader' and status <> 'absent') then
    raise exception 'this date has no leader yet; the Iris Supervisor sets one' using errcode = '23514';
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

create or replace function public.decide_change_request(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare cr public.change_request; se public.session; mine public.session_assignment;
begin
  select * into cr from public.change_request where id = p_request for update;
  select * into se from public.session where id = cr.session_id;
  if cr.id is null or not public.can_schedule(se.residency_id) then
    raise exception 'only the Iris Supervisor or an admin decides requests' using errcode = '42501';
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

create or replace function public.set_unavailable(p_session uuid, p_unavailable boolean)
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
    raise exception 'dates you can''t play are marked while the month is open for the team; after that, call the Iris Supervisor' using errcode = '23514';
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

create or replace function public.mark_not_there(p_session uuid, p_not_there boolean)
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
    raise exception 'this week is approved; ask the Iris Supervisor to correct it' using errcode = '23514';
  end if;
  if p_not_there and me.role = 'leader' and exists (select 1 from public.session_report where session_id = p_session) then
    raise exception 'you documented this date as its leader; ask the Iris Supervisor to correct it' using errcode = '23514';
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

create or replace function public.cancel_day_of(p_session uuid, p_reason public.cancellation_reason)
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
    raise exception 'a day-of cancellation is recorded on the day or after; for later dates, call the Iris Supervisor' using errcode = '23514';
  end if;
  if se.schedule_state = 'canceled' then
    raise exception 'this date is already "No Program"' using errcode = '23514';
  end if;
  if exists (select 1 from public.session_report where session_id = p_session) then
    raise exception 'this date has already been documented' using errcode = '23514';
  end if;
  if public.is_session_in_approved_week(p_session) then
    raise exception 'this week is approved; ask the Iris Supervisor to correct it' using errcode = '23514';
  end if;
  perform set_config('iris.month_action', 'on', true);
  perform set_config('iris.publishing', 'on', true);
  update public.session set schedule_state = 'canceled', cancellation_reason = p_reason, canceled_at = se.starts_at
   where id = p_session;
  perform set_config('iris.publishing', 'off', true);
  perform set_config('iris.month_action', 'off', true);
end;
$$;

create or replace function public.open_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; opened integer := 0; s record; label text; rname text; due date; by_when text;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the Iris Supervisor or an admin can open a month' using errcode = '42501';
  end if;
  if p_site is not null and not exists (select 1 from public.residency_site where residency_id = p_residency and site_id = p_site) then
    raise exception 'that site isn''t part of this residency' using errcode = '23514';
  end if;
  select name into rname from public.residency where id = p_residency;
  label := to_char(m, 'FMMonth YYYY');
  for s in select st.id, st.display_name, st.timezone from public.residency_site rs join public.site st on st.id = rs.site_id
            where rs.residency_id = p_residency and (p_site is null or rs.site_id = p_site) loop
    insert into public.schedule_month (residency_id, site_id, month, team_due_on, final_due_on, opened_by)
    values (p_residency, s.id, m,
            public.schedule_due_on(m, 'schedule_internal_due_day', 10),
            public.schedule_due_on(m, 'schedule_partner_due_day', 15),
            (select auth.uid()))
    on conflict (residency_id, site_id, month) do nothing;
    if found then
      opened := opened + 1;
      -- Lauren, Nov 27, 2026: a month opened after the team's deadline says
      -- "As soon as possible", not a date that has already passed (and the
      -- deadline isn't moved). "Today" is the building's own date.
      due := public.schedule_due_on(m, 'schedule_internal_due_day', 10);
      by_when := case when due < (now() at time zone coalesce(s.timezone, 'America/New_York'))::date
                      then 'As soon as possible'
                      else 'By ' || to_char(due, 'FMDay, FMMonth FMDD') end;
      insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
      select 'month_opened', p.id, p.email,
             label || ' at ' || s.display_name || ' is open for the team',
             label || ' at ' || s.display_name || ' (' || rname || ') is open. ' || by_when || ':' || chr(10) ||
             '- add a title to each date you lead;' || chr(10) ||
             '- mark any date you can''t play (on the date, in the calendar);' || chr(10) ||
             '- propose a leader swap if you need one.',
             'month_opened:' || p_residency || ':' || s.id || ':' || m || ':' || p.id
      from public.month_players(p_residency, s.id, m) mp join public.person p on p.id = mp and p.active
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
  return opened;
end;
$$;
