-- "Activities are logged after they happen" compared the activity's date with
-- today's date on the database's clock, which is UTC. After 7 pm Eastern
-- (8 pm in summer) UTC is already tomorrow, so an activity dated tomorrow
-- at the site was accepted. Found by the money tests, which failed on main
-- only in the evening (Ryan's side, Nov 22, 2026).
--
-- Fix: compare with today's date in the site's own time zone (Site.timezone).
-- Everything else in the guard is unchanged from 20261125120000_documentation.

create or replace function public.relationship_activity_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare site_today date;
begin
  if not exists (select 1 from public.residency_site where residency_id = new.residency_id and site_id = new.site_id) then
    raise exception 'that site isn''t part of this program' using errcode = '23514';
  end if;
  if new.session_id is not null and not exists (
    select 1 from public.session where id = new.session_id and residency_id = new.residency_id) then
    raise exception 'that session belongs to another program' using errcode = '23514';
  end if;
  select (now() at time zone st.timezone)::date into site_today from public.site st where st.id = new.site_id;
  if new.occurred_on > coalesce(site_today, (now() at time zone 'America/New_York')::date) then
    raise exception 'activities are logged after they happen' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
