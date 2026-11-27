-- A month opened after the team's deadline (the 10th) told musicians to
-- finish "By" a date that had already passed. Lauren, Nov 27, 2026: such
-- notices say "As soon as possible" instead; the deadline itself stays
-- (DOMAIN-MODEL ScheduleMonth, D17). Only the opening notice can go out late:
-- the To do reminder goes the day before the deadline.

create or replace function public.open_schedule_month(p_residency uuid, p_site uuid, p_month date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare m date := date_trunc('month', p_month)::date; opened integer := 0; s record; label text; rname text; due date; by_when text;
begin
  if not public.can_schedule(p_residency) then
    raise exception 'only the point person or an admin can open a month' using errcode = '42501';
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
revoke all on function public.open_schedule_month(uuid, uuid, date) from public, anon;
grant execute on function public.open_schedule_month(uuid, uuid, date) to authenticated;
