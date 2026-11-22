-- Season tools for the point person's season view (DOMAIN-MODEL v0.16,
-- decided by Lauren Nov 22, 2026): set a weekly program's leader for the
-- whole season, and fill every month of a season at once. Same permission
-- as scheduling (can_schedule: Admin Lead, point person, admins).

-- Makes p_person the usual leader of a weekly program, and the leader of
-- every draft (not published, not canceled) date of it from today on.
-- They're added to dates they weren't on, if they're on that date's roster.
-- Pass null to clear the usual leader (existing dates keep their leaders).
create function public.set_series_leader(p_series uuid, p_person uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare s public.series%rowtype; changed integer := 0; ses record;
begin
  select * into s from public.series where id = p_series;
  if not found or not public.can_schedule(s.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.series set default_leader_id = p_person where id = p_series;
  if p_person is null then return 0; end if;

  for ses in
    select se.id, public.session_local_date(se.id) as d from public.session se
    where se.series_id = p_series and se.schedule_state = 'draft' and se.kind = 'group_session'
      and se.starts_at >= date_trunc('day', now())
  loop
    -- Only if the person is on the roster for that date.
    continue when not exists (
      select 1 from public.roster_member rm join public.season sn on sn.id = rm.season_id
      where sn.residency_id = s.residency_id and rm.person_id = p_person
        and ses.d between sn.starts_on and sn.ends_on and (rm.left_on is null or rm.left_on >= ses.d));
    update public.session_assignment set role = 'participant'
      where session_id = ses.id and role = 'leader' and person_id <> p_person;
    insert into public.session_assignment (session_id, person_id, role)
      values (ses.id, p_person, 'leader')
      on conflict (session_id, person_id) do update set role = 'leader', status = 'assigned';
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;

-- Fills every month of a season from its residency's weekly programs.
create function public.generate_season(p_season uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare sn public.season%rowtype; m date; total integer := 0;
begin
  select * into sn from public.season where id = p_season;
  if not found or not public.can_schedule(sn.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for m in select g::date from generate_series(date_trunc('month', sn.starts_on), sn.ends_on, interval '1 month') g loop
    total := total + public.generate_residency_month(sn.residency_id, m);
  end loop;
  -- Each weekly program's own start and end dates limit which dates are created.
  return total;
end;
$$;

revoke all on function public.set_series_leader(uuid, uuid) from public, anon;
grant execute on function public.set_series_leader(uuid, uuid) to authenticated;
revoke all on function public.generate_season(uuid) from public, anon;
grant execute on function public.generate_season(uuid) to authenticated;
