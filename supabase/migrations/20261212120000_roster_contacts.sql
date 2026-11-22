-- Roster phone and instruments (DOMAIN-MODEL v0.27; decided by Lauren
-- Nov 22, 2026). People who can see a program (its roster, point person and
-- admins) see each roster musician's phone and instruments on the season
-- roster. Email stays private. Widens v0.13 ("names only") for these two
-- fields, within one program.

create function public.residency_roster_contacts(p_residency uuid)
returns table (person_id uuid, phone text, instruments text[])
language sql stable security definer set search_path = ''
as $$
  select distinct p.id, p.phone, p.instruments
  from public.person p
  where public.can_view_residency(p_residency)
    and p.active
    and exists (select 1 from public.roster_member rm join public.season s on s.id = rm.season_id
                where s.residency_id = p_residency and rm.person_id = p.id);
$$;
revoke all on function public.residency_roster_contacts(uuid) from public, anon;
grant execute on function public.residency_roster_contacts(uuid) to authenticated;
comment on function public.residency_roster_contacts(uuid) is
  'Phone and instruments of a program''s roster musicians, for people who can see the program (v0.27). No email.';
