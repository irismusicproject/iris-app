-- v0.33 (Lauren, Nov 22, 2026): merge two people into one.
--
-- For when the same person ended up with two records, e.g. a wrong email in
-- the import, or a new address set up as a new person. Admins only. The kept
-- record ends up with everything from both: roster places, staff roles
-- (point person), usual programs, dates, documentation, relationship
-- building, hours, pay rates, reflections and calendars. The other record is
-- deleted (the server then deletes its sign-in account and, if needed, sets
-- the email and sends a "set a new password" email).
--
-- It should never happen that both have hours for the same week, a pay rate
-- for the same season or a reflection for the same month; if it does, the
-- merge stops and says where, so an admin can sort it out first.
-- All or nothing (one transaction).

create function public.merge_person(p_from uuid, p_into uuid, p_end_sessions boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  f public.person;
  rm record;
  a record;
  t public.time_entry;
  kept uuid;
  clash text;
begin
  if not public.is_admin() then
    raise exception 'only admins can merge people' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'choose two different people' using errcode = '22023';
  end if;
  if p_from = (select auth.uid()) then
    raise exception 'you can''t merge yourself away; open your own page and merge the other record into it' using errcode = '42501';
  end if;
  select * into f from public.person where id = p_from;
  if f.id is null or not exists (select 1 from public.person where id = p_into) then
    raise exception 'that person wasn''t found' using errcode = '22023';
  end if;

  -- Overlaps that would mean double pay or two answers: stop and say where.
  select string_agg(distinct r.name || ' (' || s.name || ')', ', ') into clash
    from public.contract c1 join public.contract c2 on c2.season_id = c1.season_id and c2.person_id = p_into
    join public.season s on s.id = c1.season_id join public.residency r on r.id = s.residency_id
    where c1.person_id = p_from;
  if clash is not null then
    raise exception 'both have a pay rate for %; remove one first', clash using errcode = '23514';
  end if;
  select string_agg(distinct r.name || ', week of ' || to_char(t1.week_starting, 'Mon FMDD'), '; ') into clash
    from public.time_entry t1 join public.time_entry t2 on t2.person_id = p_into and t2.residency_id = t1.residency_id
      and t2.week_starting = t1.week_starting and t2.time_category_id = t1.time_category_id
    join public.residency r on r.id = t1.residency_id
    where t1.person_id = p_from;
  if clash is not null then
    raise exception 'both have hours for %; sort those weeks out first', clash using errcode = '23514';
  end if;
  select string_agg(distinct r.name || ', ' || to_char(m1.month, 'Mon YYYY'), '; ') into clash
    from public.monthly_reflection m1 join public.monthly_reflection m2 on m2.person_id = p_into
      and m2.residency_id = m1.residency_id and m2.month = m1.month
    join public.residency r on r.id = m1.residency_id
    where m1.person_id = p_from;
  if clash is not null then
    raise exception 'both have a monthly reflection for %; remove one first', clash using errcode = '23514';
  end if;

  -- 1. Roster places (the guard forbids changing person_id, so add rows).
  for rm in select * from public.roster_member where person_id = p_from loop
    select id into kept from public.roster_member where season_id = rm.season_id and person_id = p_into;
    if kept is null then
      insert into public.roster_member (season_id, person_id, is_core, is_admin_lead, joined_on, left_on)
      values (rm.season_id, p_into, rm.is_core, false, rm.joined_on, rm.left_on)
      returning id into kept;
    else
      update public.roster_member set is_core = is_core or rm.is_core,
        joined_on = least(joined_on, rm.joined_on),
        left_on = case when left_on is null or rm.left_on is null then null else greatest(left_on, rm.left_on) end
      where id = kept;
    end if;
    if rm.is_admin_lead then
      update public.roster_member set is_admin_lead = false where id = rm.id;
      update public.roster_member set is_admin_lead = true where id = kept;
    end if;
  end loop;

  -- 2. Point person and other staff roles.
  update public.staff_assignment sa set person_id = p_into
  where sa.person_id = p_from
    and not exists (select 1 from public.staff_assignment x
                    where x.person_id = p_into and x.residency_id = sa.residency_id and x.role = sa.role
                      and x.ends_on is not distinct from sa.ends_on);
  delete from public.staff_assignment where person_id = p_from;

  -- 3. Usual leader and usual musicians.
  update public.series set default_leader_id = p_into where default_leader_id = p_from;
  insert into public.series_default_person (series_id, person_id)
    select series_id, p_into from public.series_default_person where person_id = p_from
  on conflict do nothing;
  delete from public.series_default_person where person_id = p_from;

  -- 4. Dates they're assigned to.
  update public.session_assignment set substitute_for_id = p_into where substitute_for_id = p_from;
  for a in select * from public.session_assignment where person_id = p_from loop
    delete from public.session_assignment where id = a.id;
    if exists (select 1 from public.session_assignment where session_id = a.session_id and person_id = p_into) then
      if a.role = 'leader' then
        update public.session_assignment set role = 'leader' where session_id = a.session_id and person_id = p_into;
      end if;
    else
      insert into public.session_assignment (session_id, person_id, role, status, substitute_for_id)
      values (a.session_id, p_into, a.role, a.status, a.substitute_for_id);
    end if;
  end loop;

  -- 5. Documentation and relationship building.
  update public.session_report set author_id = p_into where author_id = p_from;
  -- A log one of them wrote that credits the other: the writer is credited already.
  delete from public.relationship_activity_musician m using public.relationship_activity r
    where m.activity_id = r.id and ((m.person_id = p_into and r.person_id = p_from) or (m.person_id = p_from and r.person_id = p_into));
  update public.relationship_activity set person_id = p_into where person_id = p_from;
  delete from public.relationship_activity_musician m
    where m.person_id = p_from and exists (select 1 from public.relationship_activity_musician x where x.activity_id = m.activity_id and x.person_id = p_into);
  update public.relationship_activity_musician set person_id = p_into where person_id = p_from;
  update public.resident set created_by = p_into where created_by = p_from;
  update public.monthly_reflection set person_id = p_into where person_id = p_from;

  -- 6. Hours (the guard forbids changing person_id, so re-add each entry) and pay.
  update public.time_entry set approved_by = p_into where approved_by = p_from;
  for t in select * from public.time_entry where person_id = p_from loop
    delete from public.time_entry where id = t.id;
    t.person_id := p_into;
    insert into public.time_entry select t.*;
  end loop;
  update public.contract set person_id = p_into where person_id = p_from;

  -- 7. Calendars and notifications.
  update public.calendar_export set generated_by = p_into where generated_by = p_from;
  update public.calendar_export set reviewed_by = p_into where reviewed_by = p_from;
  if exists (select 1 from public.calendar_feed where person_id = p_into) then
    delete from public.calendar_feed where person_id = p_from;
  else
    update public.calendar_feed set person_id = p_into where person_id = p_from;
  end if;
  update public.notification set person_id = p_into where person_id = p_from;

  -- 8. The kept record: fill its empty details from the other, combine
  --    instruments and roles, then delete the other record.
  delete from public.roster_member where person_id = p_from;
  delete from public.person where id = p_from;
  update public.person p set
    phone = coalesce(p.phone, f.phone),
    job_title = coalesce(p.job_title, f.job_title),
    certified_on = coalesce(p.certified_on, f.certified_on),
    instruments = array(select distinct unnest(p.instruments || f.instruments)),
    system_roles = array(select distinct unnest(p.system_roles || f.system_roles)),
    invited_at = greatest(p.invited_at, f.invited_at),
    active = p.active or f.active
  where p.id = p_into;

  -- 9. Sign everyone out of the kept account when its password is being reset.
  if p_end_sessions then
    delete from auth.sessions where user_id = p_into;
  end if;
end;
$$;

revoke all on function public.merge_person(uuid, uuid, boolean) from public, anon;
grant execute on function public.merge_person(uuid, uuid, boolean) to authenticated;
