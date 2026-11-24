-- The To do list (my_tasks) decided "today" with current_date, which is the
-- database's UTC date: from about 7 pm Eastern it is already tomorrow. On a
-- month's last evening the point person's "Open [month] for the team" then
-- pointed a month ahead (exactly when months are opened, around the 1st), and
-- "Submit your week" could pick its week early. queue_month_reminders already
-- uses Eastern time; this makes the To do list agree with it. Same inputs and
-- outputs; only the 13 uses of current_date change (same bug class as #67, #94).
-- Ryan's side, Nov 24, 2026.

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
  -- Point person: open next month
  select 'open_month', 'Open ' || to_char(date_trunc('month', (now() at time zone 'America/New_York')::date + interval '1 month'), 'FMMonth') || ' for the team',
         r.name, date_trunc('month', (now() at time zone 'America/New_York')::date)::date, r.id, null::uuid,
         date_trunc('month', (now() at time zone 'America/New_York')::date + interval '1 month')::date, null::uuid, null::uuid
    from pp join public.residency r on r.id = pp.residency_id and r.status = 'active'
   where exists (select 1 from public.residency_site rs where rs.residency_id = r.id
                  and not exists (select 1 from public.schedule_month sm where sm.residency_id = r.id and sm.site_id = rs.site_id
                                    and sm.month = date_trunc('month', (now() at time zone 'America/New_York')::date + interval '1 month')::date))
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
revoke all on function public.my_tasks() from public, anon;
grant execute on function public.my_tasks() to authenticated;
