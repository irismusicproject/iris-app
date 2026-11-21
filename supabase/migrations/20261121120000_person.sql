-- Person: anyone who signs in (musicians, staff, volunteers).
-- See docs/DOMAIN-MODEL.md, section 2 ("Person") and section 7 (permissions).
--
-- Rules (confirmed by Ryan, Nov 21, 2026):
--   * Admins see and edit everyone. Everyone else sees only their own record.
--   * A person may change only their own phone and instruments.
--   * People are deactivated, never deleted. A deactivated person can read
--     nothing, even with a still-valid session.

create type public.employment_type as enum ('contractor_1099', 'employee_w2', 'volunteer');
create type public.system_role as enum ('admin');

create table public.person (
  id              uuid primary key references auth.users (id) on delete restrict,
  name            text not null check (length(btrim(name)) between 1 and 200),
  email           text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  phone           text check (phone is null or length(phone) <= 40),
  employment_type public.employment_type not null,
  instruments     text[] not null default '{}',
  system_roles    public.system_role[] not null default '{}',
  job_title       text check (job_title is null or length(job_title) <= 200),
  active          boolean not null default true,
  certified_on    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index person_email_key on public.person (email);

comment on table public.person is 'Anyone who signs in. Deactivate (active = false); never delete.';
comment on column public.person.job_title is 'Org-chart title. Display only; grants no permissions.';

alter table public.person enable row level security;

-- Helper functions. SECURITY DEFINER so they can read person without
-- recursing into person's own RLS policies.
create function public.is_active_person()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.person p
    where p.id = (select auth.uid()) and p.active
  );
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.person p
    where p.id = (select auth.uid())
      and p.active
      and 'admin' = any (p.system_roles)
  );
$$;

revoke all on function public.is_active_person() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_active_person() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Table privileges: signed-in users only, and never DELETE.
revoke all on public.person from anon, authenticated;
grant select, insert, update on public.person to authenticated;

create policy "person: admins read all; active people read themselves"
  on public.person for select to authenticated
  using ((select public.is_admin()) or (id = (select auth.uid()) and active));

create policy "person: admins add people"
  on public.person for insert to authenticated
  with check ((select public.is_admin()));

create policy "person: admins update anyone; active people update themselves"
  on public.person for update to authenticated
  using ((select public.is_admin()) or (id = (select auth.uid()) and active))
  with check ((select public.is_admin()) or (id = (select auth.uid()) and active));

-- Non-admins may change only phone and instruments, and nobody may change
-- id, email or created_at here (email belongs to sign-in; see README).
create function public.person_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'id, email and created_at cannot be changed'
      using errcode = '42501';
  end if;

  -- The service role (server-side admin tasks) and SQL editor have no auth.uid().
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.name            is distinct from old.name
       or new.employment_type is distinct from old.employment_type
       or new.system_roles    is distinct from old.system_roles
       or new.job_title       is distinct from old.job_title
       or new.active          is distinct from old.active
       or new.certified_on    is distinct from old.certified_on then
      raise exception 'only admins can change that field'
        using errcode = '42501';
    end if;
  end if;

  -- An admin can't remove their own admin role or deactivate themselves,
  -- so Iris can't be locked out by accident.
  if old.id = (select auth.uid())
     and ('admin' = any (old.system_roles))
     and (not ('admin' = any (new.system_roles)) or not new.active) then
    raise exception 'admins cannot remove their own admin role or deactivate themselves'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger person_guard_update
  before update on public.person
  for each row execute function public.person_guard_update();
