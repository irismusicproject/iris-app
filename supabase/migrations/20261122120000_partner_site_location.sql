-- Partner, Site, Location: the organizations Iris works with, their buildings
-- or campuses, and the rooms within them. See docs/DOMAIN-MODEL.md section 1.
--
-- Decisions (Ryan, Nov 2026):
--   * No object between Partner and Site. A multi-building partner such as
--     CESLC is one Partner with one Site per building; a Residency may span
--     several Sites.
--   * Distance between sites is not stored; each Site has an address and time zone.
--   * Partner billing fields are optional; D4 (who is invoiced) stays open.
--   * Admins only, until rosters exist. Then roster members get read access
--     to their residency's sites (DOMAIN-MODEL section 7).
--   * Retire (active = false), never delete.

create type public.care_level as enum (
  'independent', 'assisted', 'memory_care', 'skilled_nursing',
  'adult_day', 'affordable_housing', 'other'
);

-- Shared trigger: keep updated_at current.
create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.partner (
  id              uuid primary key default gen_random_uuid(),
  legal_name      text not null check (length(btrim(legal_name)) between 1 and 200),
  display_name    text not null check (length(btrim(display_name)) between 1 and 200),
  billing_address text check (billing_address is null or length(billing_address) <= 500),
  billing_email   text check (billing_email is null or (billing_email = lower(btrim(billing_email)) and billing_email like '%_@_%')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index partner_legal_name_key on public.partner (lower(legal_name));

create table public.site (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partner (id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 200),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  care_levels  public.care_level[] not null default '{}',
  address      text check (address is null or length(address) <= 300),
  city         text check (city is null or length(city) <= 100),
  state        text check (state is null or length(state) <= 50),
  timezone     text not null default 'America/New_York',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index site_partner_name_key on public.site (partner_id, lower(name));
create index site_partner_id_idx on public.site (partner_id);

create table public.location (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.site (id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 200),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index location_site_name_key on public.location (site_id, lower(name));
create index location_site_id_idx on public.location (site_id);

-- Integrity: a site's time zone must be a real one (sites span ET, CT and
-- MST), and a site or location can't be moved to another parent: history
-- (residencies, sessions) will hang off them.
create function public.site_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.partner_id is distinct from old.partner_id then
    raise exception 'a site cannot be moved to another partner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.location_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.site_id is distinct from old.site_id then
    raise exception 'a location cannot be moved to another site' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger site_guard before insert or update on public.site
  for each row execute function public.site_guard();
create trigger location_guard before update on public.location
  for each row execute function public.location_guard();

create trigger partner_set_updated_at before update on public.partner
  for each row execute function public.set_updated_at();
create trigger site_set_updated_at before update on public.site
  for each row execute function public.set_updated_at();
create trigger location_set_updated_at before update on public.location
  for each row execute function public.set_updated_at();

-- Row Level Security: admins only, and no deletes.
alter table public.partner  enable row level security;
alter table public.site     enable row level security;
alter table public.location enable row level security;

revoke all on public.partner, public.site, public.location from anon, authenticated;
grant select, insert, update on public.partner, public.site, public.location to authenticated;

create policy "partner: admins read"   on public.partner for select to authenticated using ((select public.is_admin()));
create policy "partner: admins add"    on public.partner for insert to authenticated with check ((select public.is_admin()));
create policy "partner: admins update" on public.partner for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "site: admins read"   on public.site for select to authenticated using ((select public.is_admin()));
create policy "site: admins add"    on public.site for insert to authenticated with check ((select public.is_admin()));
create policy "site: admins update" on public.site for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "location: admins read"   on public.location for select to authenticated using ((select public.is_admin()));
create policy "location: admins add"    on public.location for insert to authenticated with check ((select public.is_admin()));
create policy "location: admins update" on public.location for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
