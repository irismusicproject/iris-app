-- v0.33 (Lauren, Nov 22, 2026): merge a duplicate person into another.
--
-- Rules (Lauren): admins only; the person merged away must never have
-- signed in (e.g. a duplicate from the import); if they have any pay, hours,
-- documentation or resident records the merge stops and says what's in the
-- way; afterwards their record is deleted (the server then deletes their
-- sign-in account).
--
-- Moves: roster places, point person / staff roles, usual leader and usual
-- musicians, assignments on dates (incl. "substitute for"). Removes their
-- calendar feed and notifications. All or nothing (one transaction).

create function public.merge_person(p_from uuid, p_into uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  rm record;
  a record;
  kept uuid;
  blockers text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'only admins can merge people' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'choose two different people' using errcode = '22023';
  end if;
  if p_from = (select auth.uid()) then
    raise exception 'you can''t merge yourself away' using errcode = '42501';
  end if;
  if not exists (select 1 from public.person where id = p_into and active) then
    raise exception 'the person to keep must be active' using errcode = '22023';
  end if;
  if not exists (select 1 from public.person where id = p_from) then
    raise exception 'that person wasn''t found' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where id = p_from and last_sign_in_at is not null) then
    raise exception 'they''ve already signed in, so they can''t be merged away' using errcode = '42501';
  end if;

  -- Stop if they have pay, hours, documentation or resident records.
  if exists (select 1 from public.contract where person_id = p_from) then blockers := blockers || 'a pay rate (contract)'; end if;
  if exists (select 1 from public.time_entry where person_id = p_from or approved_by = p_from) then blockers := blockers || 'hours'; end if;
  if exists (select 1 from public.session_report where author_id = p_from) then blockers := blockers || 'documentation'; end if;
  if exists (select 1 from public.relationship_activity where person_id = p_from)
     or exists (select 1 from public.relationship_activity_musician where person_id = p_from) then blockers := blockers || 'relationship-building logs'; end if;
  if exists (select 1 from public.monthly_reflection where person_id = p_from) then blockers := blockers || 'monthly reflections'; end if;
  if exists (select 1 from public.resident where created_by = p_from) then blockers := blockers || 'residents they added'; end if;
  if exists (select 1 from public.calendar_export where generated_by = p_from or reviewed_by = p_from) then blockers := blockers || 'published calendars'; end if;
  if array_length(blockers, 1) > 0 then
    raise exception 'they have % in the app, so they can''t be merged', array_to_string(blockers, ', ') using errcode = '23514';
  end if;

  -- 1. Roster places: add the kept person where missing (same dates and flags).
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

  -- 5. What's left of them, then the record itself.
  delete from public.roster_member where person_id = p_from;
  delete from public.calendar_feed where person_id = p_from;
  delete from public.notification where person_id = p_from;
  delete from public.person where id = p_from;
end;
$$;

revoke all on function public.merge_person(uuid, uuid) from public, anon;
grant execute on function public.merge_person(uuid, uuid) to authenticated;
