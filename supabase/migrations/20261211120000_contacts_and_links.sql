-- Contacts and links (DOMAIN-MODEL v0.26; decided by Lauren Nov 22, 2026).
--
-- 1. PartnerContact: community contacts per building (name, title, phone,
--    email). Added and changed by the program's point person or an admin;
--    seen by that program's people (roster, point person, admins).
--    Removing a contact retires it (active = false); it's never deleted.
-- 2. staff_directory(): every active admin (the Iris team), plus anyone who
--    is currently a program's point person, with job title, email and phone,
--    for everyone signed in (Home and program pages).
-- 3. ResourceLink: labeled links on Home (e.g. photo folders on Google
--    Drive or Dropbox). Admins manage; everyone signed in sees them.

-- Helpers ----------------------------------------------------------------------
create function public.can_view_site(p_site uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.residency_site rs where rs.site_id = p_site and public.can_view_residency(rs.residency_id));
$$;
revoke all on function public.can_view_site(uuid) from public, anon;
grant execute on function public.can_view_site(uuid) to authenticated;

create function public.can_plan_site(p_site uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.residency_site rs where rs.site_id = p_site and public.can_schedule(rs.residency_id));
$$;
revoke all on function public.can_plan_site(uuid) from public, anon;
grant execute on function public.can_plan_site(uuid) to authenticated;

-- 1 ---------------------------------------------------------------------------
create table public.partner_contact (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner (id) on delete restrict,
  name       text not null check (length(btrim(name)) between 1 and 200),
  title      text check (title is null or length(title) <= 200),
  email      text check (email is null or (length(email) <= 320 and email like '%_@_%')),
  phone      text check (phone is null or length(phone) <= 40),
  receives   text[] not null default '{}' check (receives <@ array['calendar', 'invoice']),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.partner_contact_site (
  contact_id uuid not null references public.partner_contact (id) on delete cascade,
  site_id    uuid not null references public.site (id) on delete restrict,
  primary key (contact_id, site_id)
);
create index partner_contact_site_site_idx on public.partner_contact_site (site_id);
create trigger partner_contact_set_updated_at before update on public.partner_contact for each row execute function public.set_updated_at();
create trigger partner_contact_audit after insert or update on public.partner_contact for each row execute function public.write_audit_log();

alter table public.partner_contact enable row level security;
alter table public.partner_contact_site enable row level security;
revoke all on public.partner_contact, public.partner_contact_site from anon, authenticated;
grant select on public.partner_contact, public.partner_contact_site to authenticated;
create policy "partner_contact: the site's people read" on public.partner_contact for select to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.partner_contact_site cs where cs.contact_id = id and public.can_view_site(cs.site_id)));
create policy "partner_contact_site: the site's people read" on public.partner_contact_site for select to authenticated
  using ((select public.can_view_site(site_id)));

-- Add or change a building's contact (point person of a program at that site, or an admin).
create function public.save_site_contact(p_site uuid, p_contact uuid, p_name text, p_title text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare cid uuid := p_contact;
begin
  if not public.can_plan_site(p_site) then
    raise exception 'only the point person or an admin changes community contacts' using errcode = '42501';
  end if;
  if cid is null then
    insert into public.partner_contact (partner_id, name, title, email, phone)
    select s.partner_id, btrim(p_name), nullif(btrim(p_title), ''), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), '')
    from public.site s where s.id = p_site
    returning id into cid;
    insert into public.partner_contact_site (contact_id, site_id) values (cid, p_site);
  else
    if not exists (select 1 from public.partner_contact_site where contact_id = cid and site_id = p_site) then
      raise exception 'that contact isn''t at this building' using errcode = '42501';
    end if;
    update public.partner_contact
       set name = btrim(p_name), title = nullif(btrim(p_title), ''), email = nullif(lower(btrim(p_email)), ''), phone = nullif(btrim(p_phone), '')
     where id = cid;
  end if;
  return cid;
end;
$$;
revoke all on function public.save_site_contact(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.save_site_contact(uuid, uuid, text, text, text, text) to authenticated;

create function public.retire_site_contact(p_site uuid, p_contact uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_plan_site(p_site) then
    raise exception 'only the point person or an admin changes community contacts' using errcode = '42501';
  end if;
  update public.partner_contact set active = false
   where id = p_contact and exists (select 1 from public.partner_contact_site where contact_id = p_contact and site_id = p_site);
end;
$$;
revoke all on function public.retire_site_contact(uuid, uuid) from public, anon;
grant execute on function public.retire_site_contact(uuid, uuid) to authenticated;

-- 2 ---------------------------------------------------------------------------
create function public.staff_directory()
returns table (person_id uuid, name text, job_title text, email text, phone text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.job_title, p.email, p.phone
  from public.person p
  where p.active and public.is_active_person()
    and ('admin' = any (p.system_roles) or exists (
      select 1 from public.staff_assignment sa where sa.person_id = p.id
        and sa.starts_on <= current_date and (sa.ends_on is null or sa.ends_on >= current_date)))
  order by p.name;
$$;
revoke all on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;

-- 3 ---------------------------------------------------------------------------
create table public.resource_link (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (length(btrim(label)) between 1 and 120),
  url        text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger resource_link_set_updated_at before update on public.resource_link for each row execute function public.set_updated_at();
create trigger resource_link_audit after insert or update on public.resource_link for each row execute function public.write_audit_log();
alter table public.resource_link enable row level security;
revoke all on public.resource_link from anon, authenticated;
grant select, insert, update on public.resource_link to authenticated;
create policy "resource_link: signed-in read" on public.resource_link for select to authenticated
  using ((select public.is_active_person()));
create policy "resource_link: admins add" on public.resource_link for insert to authenticated
  with check ((select public.is_admin()));
create policy "resource_link: admins update" on public.resource_link for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
