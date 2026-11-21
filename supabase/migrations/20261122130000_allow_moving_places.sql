-- Let admins move a site to another partner, and a location to another
-- site, while the Partner/Site/Location structure is still being settled
-- (Ryan, Nov 22, 2026; Lauren has the final say on the structure).
-- Nothing refers to sites or locations yet, so moving one rewrites no
-- history. Bring the lock back in the migration that adds sessions.

create or replace function public.site_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger location_guard on public.location;
drop function public.location_guard();
