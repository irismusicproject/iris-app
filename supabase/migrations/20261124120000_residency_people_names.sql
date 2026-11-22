-- Names of the people in a program (residency), for schedules and rosters.
-- Decided by Lauren, Nov 22, 2026 (DOMAIN-MODEL v0.13, section 7): anyone
-- who can see a residency (its current roster, its Iris staff, admins) can
-- see the NAMES of the people on its rosters and staff, and nothing else
-- about them. The person table itself stays as it is (admins see everyone;
-- everyone else sees only their own record), so email, phone and the rest
-- stay private.

create function public.residency_people(p_residency uuid)
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select distinct p.id, p.name
  from public.person p
  where public.can_view_residency(p_residency)
    and (
      exists (select 1 from public.roster_member rm join public.season s on s.id = rm.season_id
              where s.residency_id = p_residency and rm.person_id = p.id)
      or exists (select 1 from public.staff_assignment sa
                 where sa.residency_id = p_residency and sa.person_id = p.id)
    )
  order by p.name;
$$;

revoke all on function public.residency_people(uuid) from public, anon;
grant execute on function public.residency_people(uuid) to authenticated;

comment on function public.residency_people(uuid) is
  'Names only of a residency''s roster and staff, for people who can see the residency.';
