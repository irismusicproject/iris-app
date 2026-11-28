-- Rooms on the partner (Ryan, Nov 27, 2026). A room (Location) still belongs
-- to a building (Site), because time zones, partner calendars, community
-- invoices and monthly stages all work per building. But a partner with one
-- building no longer needs it set up by hand:
--   * add_partner_room adds a room from the partner's page. With no building
--     yet, it makes one named after the partner (Eastern time; an admin can
--     change it). With one building, it uses it, and links it to any of the
--     partner's programs that have no building. With several, the caller
--     picks one.
--   * (the website links a new program to a one-building partner's
--     building when the program is made: src/app/residencies/actions.ts)
--   * the Iris Supervisor may add and rename rooms at their program's
--     buildings (admins anywhere, as before).

create or replace function public.add_partner_room(p_partner uuid, p_name text, p_display_name text default null, p_site uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_site uuid; v_count integer; v_id uuid; p public.partner%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins add rooms from a partner''s page' using errcode = '42501';
  end if;
  select * into p from public.partner where id = p_partner;
  if not found then raise exception 'no such partner' using errcode = '23503'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'give the room a name' using errcode = '23514';
  end if;
  if p_site is not null then
    select id into v_site from public.site where id = p_site and partner_id = p_partner;
    if v_site is null then raise exception 'that building belongs to another partner' using errcode = '23514'; end if;
  else
    select count(*) into v_count from public.site where partner_id = p_partner and active;
    if v_count > 1 then
      raise exception 'this partner has several buildings: pick one' using errcode = '23514';
    elsif v_count = 1 then
      select id into v_site from public.site where partner_id = p_partner and active;
    else
      insert into public.site (partner_id, name, display_name)
      values (p_partner, p.display_name, p.display_name)
      returning id into v_site;
    end if;
    -- One building: the partner's programs that have none get it.
    insert into public.residency_site (residency_id, site_id)
    select r.id, v_site from public.residency r
     where r.partner_id = p_partner
       and not exists (select 1 from public.residency_site rs where rs.residency_id = r.id);
  end if;
  insert into public.location (site_id, name, display_name)
  values (v_site, btrim(p_name), coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), btrim(p_name)))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_partner_room(uuid, text, text, uuid) from public, anon;
grant execute on function public.add_partner_room(uuid, text, text, uuid) to authenticated;

-- The Iris Supervisor adds and renames rooms at their program's buildings.
create policy "location: Iris Supervisor adds" on public.location for insert to authenticated
  with check (exists (select 1 from public.residency_site rs
                      where rs.site_id = location.site_id and (select public.can_schedule(rs.residency_id))));
create policy "location: Iris Supervisor updates" on public.location for update to authenticated
  using (exists (select 1 from public.residency_site rs
                 where rs.site_id = location.site_id and (select public.can_schedule(rs.residency_id))))
  with check (exists (select 1 from public.residency_site rs
                      where rs.site_id = location.site_id and (select public.can_schedule(rs.residency_id))));
