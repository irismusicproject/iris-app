-- D20 part 4 (Ryan, Nov 27, 2026): the month has three stages.
--   1. Team editing: the month opens by itself when its first dates exist
--      (part 2); musicians review and edit until the 10th. No "confirm" step.
--   2. Sent to partner: the Lead Musician sends the calendar on the 10th and
--      enters the partner's changes. Nobody else changes it without the Iris
--      Supervisor: musicians ask (change requests); the Iris Supervisor and
--      admins may still edit.
--   3. Final: the Lead Musician confirms the partner's changes by the 15th;
--      the month locks (changes are requests the Iris Supervisor approves).
-- The enum value team_confirmed stays for older phones and existing rows but
-- nothing sets it any more. partner_changes stays as an internal marker (a
-- change was made after sending, so "final" sends a new version); screens
-- show it as "Sent to partner".

create or replace function public.confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'confirming is no longer needed: the Lead Musician sends the calendar to the partner' using errcode = '23514';
end;
$$;

create or replace function public.undo_confirm_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'confirming is no longer needed: the month stays open for the team until the Lead Musician sends it' using errcode = '23514';
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
  -- After sending (D20): only the partner's changes, entered by the Lead
  -- Musician; anyone else asks the Iris Supervisor (admins and the Iris
  -- Supervisor may still edit).
  if sm.stage in ('sent_to_partner', 'partner_changes')
     and not public.can_schedule(rid) and not public.is_current_admin_lead(rid) then
    raise exception 'this month''s calendar has gone to the partner; ask the Iris Supervisor for changes' using errcode = '42501';
  end if;
  -- The first change after sending marks the month "partner changes", so marking
  -- it final sends a new calendar version. On screen both read "Sent to partner".
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
  -- After sending (D20): only the Lead Musician (partner changes), the Iris
  -- Supervisor and admins; musicians ask the Iris Supervisor, subs included.
  if sm.stage in ('sent_to_partner', 'partner_changes')
     and not public.can_schedule(sm.residency_id) and not public.is_current_admin_lead(sm.residency_id) then
    raise exception 'this month''s calendar has gone to the partner; ask the Iris Supervisor for changes' using errcode = '42501';
  end if;
  -- The first change after sending marks the month "partner changes", so marking
  -- it final sends a new calendar version. On screen both read "Sent to partner".
  if sm.stage = 'sent_to_partner' then
    update public.schedule_month set stage = 'partner_changes', updated_at = now() where id = sm.id;
  end if;
  return coalesce(new, old);
end;
$$;

-- To do: no "Review and confirm" any more.
create or replace function public.my_tasks()
returns table (kind text, title text, detail text, due_on date, residency_id uuid, site_id uuid, month date,
               session_id uuid, request_id uuid)
language sql stable security definer set search_path = ''
as $$
  with me as (select p.id from public.person p where p.id = (select auth.uid()) and p.active),
  pp as (select sa.residency_id from public.staff_assignment sa, me
          where sa.person_id = me.id and sa.role = 'point_person'
            and sa.starts_on <= (now() at time zone 'America/New_York')::date and (sa.ends_on is null or sa.ends_on >= (now() at time zone 'America/New_York')::date)),
  al as (select distinct s.residency_id from public.roster_member rm join public.season s on s.id = rm.season_id, me
          where rm.person_id = me.id and rm.is_admin_lead and s.ends_on >= (now() at time zone 'America/New_York')::date
            and (rm.left_on is null or rm.left_on >= (now() at time zone 'America/New_York')::date)),
  months as (select sm.*, st.display_name as site_name, r.name as residency_name, to_char(sm.month, 'FMMonth') as month_name
               from public.schedule_month sm join public.site st on st.id = sm.site_id join public.residency r on r.id = sm.residency_id
              where sm.month >= date_trunc('month', (now() at time zone 'America/New_York')::date)::date),
  mine as (select se.id, se.residency_id, se.title, se.series_id, se.starts_at, se.kind, se.schedule_state,
                  st.id as site_id, st.timezone, a.role, a.status
             from public.session_assignment a join me on me.id = a.person_id
             join public.session se on se.id = a.session_id
             join public.location l on l.id = se.location_id join public.site st on st.id = l.site_id)
  -- Leaders: titles while the team edits
  select 'titles', 'Add titles to the ' || m.month_name || ' dates you lead',
         m.site_name || ': ' || count(*) || ' still ' || case when count(*) = 1 then 'has' else 'have' end || ' the usual title',
         m.team_due_on, m.residency_id, m.site_id, m.month, null::uuid, null::uuid
    from months m join mine x on x.residency_id = m.residency_id and x.site_id = m.site_id
     and date_trunc('month', x.starts_at at time zone x.timezone)::date = m.month
    join public.series sr on sr.id = x.series_id
   where m.stage = 'team_editing' and x.role = 'leader' and x.status <> 'absent' and x.schedule_state = 'draft' and x.title = sr.title
   group by m.month_name, m.site_name, m.team_due_on, m.residency_id, m.site_id, m.month
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
         (now() at time zone 'America/New_York')::date, se.residency_id, null, null, se.id, cr.id
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
  select 'submit_week', 'Submit your week', r.name || ', week of ' || to_char(public.week_monday((now() at time zone 'America/New_York')::date - 7), 'FMMonth FMDD'),
         public.week_monday((now() at time zone 'America/New_York')::date) + 1, r.id, null, null, null, null
    from public.residency r, me,
         lateral public.missing_work_internal(r.id, public.week_monday((now() at time zone 'America/New_York')::date - 7)) mw
   where mw.person_id = me.id and mw.documented_minutes > 0 and mw.hours_state in ('none', 'draft')
     and public.is_on_current_roster(r.id, me.id)
  order by 4, 2;
$$;

-- Reminders: no "confirm" reminder for the Iris Supervisor.
create or replace function public.queue_month_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; c integer; today date := (p_now at time zone 'America/New_York')::date;
begin
  -- The day before the 10th: leaders with usual titles (D20: no confirm reminder).
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

  -- The Lead Musician: send on the 10th; mark final the day before the 15th.
  insert into public.notification (kind, person_id, email, subject, body, dedupe_key)
  select 'month_reminder', p.id, p.email,
         case when sm.stage in ('team_editing', 'team_confirmed')
              then 'Today: send ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name || ' to the partner'
              else 'Tomorrow: mark ' || to_char(sm.month, 'FMMonth') || ' at ' || st.display_name || ' final' end,
         case when sm.stage in ('team_editing', 'team_confirmed')
              then 'Send the draft calendar to the partner today, from To do.'
              else 'Enter the partner''s changes, then mark the month final by ' || to_char(sm.final_due_on, 'FMDay, FMMonth FMDD') || '. That sends the final calendar.' end,
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
