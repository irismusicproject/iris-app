-- Hours (timesheets), contracts and musician invoices. DOMAIN-MODEL section 5
-- (v0.19) and decisions D3, D7, D9; Lauren's Nov 22, 2026 choices: hours are
-- entered on "My week", the point person approves them, and contractors get
-- a two-week invoice built from approved hours.
--
-- Permission rules (section 7):
--   * Time categories: everyone signed in reads; admins manage the list.
--   * Hours (time_entry): a musician writes their own while in draft (or sent
--     back), and submits the week. The residency's point person (and admins)
--     read them and approve or send back. Approved hours are locked.
--   * Contracts and stipends (pay): only the musician themselves and admins.
--     The point person approves hours but never sees rates.
--   * Invoices: computed by musician_invoice_lines() for the musician or an
--     admin.
-- Assumption (v0.19): pay periods are two weeks, Monday–Sunday, counted from
-- Setting pay_period_anchor (default 2026-11-02).

create type public.time_state as enum ('draft', 'submitted', 'approved');
create type public.stipend_kind as enum ('project_support', 'admin_lead', 'training', 'other');

-- ---------------------------------------------------------------------------
-- Settings (admin-editable rules; DOMAIN-MODEL "Setting")
-- ---------------------------------------------------------------------------
create table public.setting (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.setting (key, value) values ('pay_period_anchor', '2026-11-02');
alter table public.setting enable row level security;
revoke all on public.setting from anon, authenticated;
grant select, insert, update on public.setting to authenticated;
create policy "setting: signed-in read" on public.setting for select to authenticated using ((select public.is_active_person()));
create policy "setting: admins change" on public.setting for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "setting: admins add" on public.setting for insert to authenticated with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Time categories (pay categories; retired, never deleted)
-- ---------------------------------------------------------------------------
create table public.time_category (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) between 1 and 100),
  description text,
  sort_order  integer not null default 0,
  paid_hourly boolean not null default true,
  active      boolean not null default true
);
insert into public.time_category (name, description, sort_order) values
  ('Programs', 'Workshops, presentations, music committee meetings, open rehearsals and performances', 1),
  ('Relationship Building', 'Collaborative work with residents, including the 15 minutes before and after programs', 2),
  ('Concerts', 'Concerts and their set-up', 3);

alter table public.time_category enable row level security;
revoke all on public.time_category from anon, authenticated;
grant select, insert, update on public.time_category to authenticated;
create policy "time_category: signed-in read" on public.time_category for select to authenticated using ((select public.is_active_person()));
create policy "time_category: admins add" on public.time_category for insert to authenticated with check ((select public.is_admin()));
create policy "time_category: admins update" on public.time_category for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Hours: one row per person x residency x week x category (D3)
-- ---------------------------------------------------------------------------
create table public.time_entry (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references public.person (id) on delete restrict,
  residency_id     uuid not null references public.residency (id) on delete restrict,
  week_starting    date not null check (extract(isodow from week_starting) = 1),
  time_category_id uuid not null references public.time_category (id) on delete restrict,
  hours            numeric(5, 2) not null check (hours >= 0 and hours <= 80),
  source           text not null default 'manual' check (source in ('prefilled', 'manual')),
  state            public.time_state not null default 'draft',
  returned_note    text check (returned_note is null or length(returned_note) <= 1000),
  submitted_at     timestamptz,
  approved_by      uuid references public.person (id) on delete restrict,
  approved_at      timestamptz,
  updated_at       timestamptz not null default now(),
  unique (person_id, residency_id, week_starting, time_category_id)
);
create index time_entry_residency_week_idx on public.time_entry (residency_id, week_starting);

-- Musicians change only their own draft hours; approval and sending back go
-- through approve_week() / return_week().
create function public.time_entry_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'UPDATE' and old.state = 'approved' then
      raise exception 'approved hours are locked' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.state = 'submitted' and new.hours is distinct from old.hours then
      raise exception 'these hours are submitted; ask the point person to send them back to change them' using errcode = '42501';
    end if;
    if new.state = 'approved' then
      raise exception 'only the point person approves hours' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.person_id <> old.person_id or new.residency_id <> old.residency_id
                           or new.week_starting <> old.week_starting or new.time_category_id <> old.time_category_id) then
    raise exception 'start a new entry instead' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger time_entry_guard before insert or update on public.time_entry
  for each row execute function public.time_entry_guard();
create trigger time_entry_audit after insert or update on public.time_entry
  for each row execute function public.write_audit_log();

alter table public.time_entry enable row level security;
revoke all on public.time_entry from anon, authenticated;
grant select, insert, update on public.time_entry to authenticated;
create policy "time_entry: own, point person, admins read" on public.time_entry for select to authenticated
  using (person_id = (select auth.uid()) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person')));
create policy "time_entry: musicians enter their own" on public.time_entry for insert to authenticated
  with check (person_id = (select auth.uid()) and (select public.is_on_current_roster(residency_id)) and state = 'draft');
create policy "time_entry: musicians update their own" on public.time_entry for update to authenticated
  using (person_id = (select auth.uid()) and state <> 'approved')
  with check (person_id = (select auth.uid()));
create policy "time_entry: admins update" on public.time_entry for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The point person (or an admin) approves a musician's submitted week for a
-- residency, or sends it back with a note.
create function public.approve_week(p_person uuid, p_residency uuid, p_week date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the point person or an admin approves hours' using errcode = '42501';
  end if;
  update public.time_entry set state = 'approved', approved_by = (select auth.uid()), approved_at = now(), returned_note = null
   where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted';
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.return_week(p_person uuid, p_residency uuid, p_week date, p_note text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not (public.is_admin() or public.is_current_staff(p_residency, 'point_person')) then
    raise exception 'only the point person or an admin sends hours back' using errcode = '42501';
  end if;
  update public.time_entry set state = 'draft', submitted_at = null, returned_note = nullif(btrim(p_note), '')
   where person_id = p_person and residency_id = p_residency and week_starting = p_week and state = 'submitted';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.approve_week(uuid, uuid, date) from public, anon;
grant execute on function public.approve_week(uuid, uuid, date) to authenticated;
revoke all on function public.return_week(uuid, uuid, date, text) from public, anon;
grant execute on function public.return_week(uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Contracts and stipends (pay; the musician and admins only)
-- ---------------------------------------------------------------------------
create table public.contract (
  id                     uuid primary key default gen_random_uuid(),
  person_id              uuid not null references public.person (id) on delete restrict,
  season_id              uuid not null references public.season (id) on delete restrict,
  hourly_rate            numeric(8, 2) not null check (hourly_rate >= 0),
  estimated_weekly_hours numeric(5, 2) check (estimated_weekly_hours is null or estimated_weekly_hours >= 0),
  updated_at             timestamptz not null default now(),
  unique (person_id, season_id)
);
create table public.stipend_installment (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract (id) on delete cascade,
  kind        public.stipend_kind not null,
  due_on      date not null,
  amount      numeric(10, 2) not null check (amount >= 0)
);
create trigger contract_set_updated_at before update on public.contract for each row execute function public.set_updated_at();
create trigger contract_audit after insert or update on public.contract for each row execute function public.write_audit_log();

alter table public.contract enable row level security;
alter table public.stipend_installment enable row level security;
revoke all on public.contract, public.stipend_installment from anon, authenticated;
grant select, insert, update on public.contract to authenticated;
grant select, insert, update, delete on public.stipend_installment to authenticated;
create policy "contract: own or admins read" on public.contract for select to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin()));
create policy "contract: admins add" on public.contract for insert to authenticated with check ((select public.is_admin()));
create policy "contract: admins update" on public.contract for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "stipend: own or admins read" on public.stipend_installment for select to authenticated
  using (exists (select 1 from public.contract c where c.id = contract_id));
create policy "stipend: admins add" on public.stipend_installment for insert to authenticated with check ((select public.is_admin()));
create policy "stipend: admins update" on public.stipend_installment for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "stipend: admins remove" on public.stipend_installment for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Musician invoice lines for a pay period (two weeks starting p_start)
-- ---------------------------------------------------------------------------
-- Approved hours x the contract rate for the season covering each week, per
-- residency and category; plus stipend installments due in the period.
-- Contractors only (W-2 staff are paid through payroll).
create function public.musician_invoice_lines(p_person uuid, p_start date)
returns table (sort integer, residency_name text, description text, quantity numeric, unit text, unit_amount numeric, amount numeric)
language sql stable security definer set search_path = ''
as $$
  with allowed as (
    select 1 from public.person p
    where p.id = p_person and p.employment_type = 'contractor_1099'
      and (p_person = (select auth.uid()) or public.is_admin())
  ),
  hours as (
    select r.name as residency_name, tc.name as category, tc.sort_order, sum(te.hours) as hours,
           (select c.hourly_rate from public.contract c join public.season s on s.id = c.season_id
             where c.person_id = te.person_id and s.residency_id = te.residency_id
               and te.week_starting between s.starts_on - 6 and s.ends_on
             order by s.starts_on desc limit 1) as rate
    from public.time_entry te
    join public.residency r on r.id = te.residency_id
    join public.time_category tc on tc.id = te.time_category_id
    where te.person_id = p_person and te.state = 'approved'
      and te.week_starting in (p_start, p_start + 7) and te.hours > 0
    group by r.name, tc.name, tc.sort_order, te.person_id, te.residency_id, te.week_starting
  ),
  hour_lines as (
    select 1 as sort, residency_name, category as description, sum(hours) as quantity, 'hours'::text as unit, rate as unit_amount,
           round(sum(hours) * coalesce(rate, 0), 2) as amount
    from hours group by residency_name, category, sort_order, rate
  ),
  stipend_lines as (
    select 2 as sort, r.name as residency_name,
           initcap(replace(si.kind::text, '_', ' ')) || ' stipend (due ' || to_char(si.due_on, 'Mon FMDD') || ')' as description,
           1::numeric as quantity, 'payment'::text as unit, si.amount as unit_amount, si.amount as amount
    from public.stipend_installment si
    join public.contract c on c.id = si.contract_id
    join public.season s on s.id = c.season_id
    join public.residency r on r.id = s.residency_id
    where c.person_id = p_person and si.due_on between p_start and p_start + 13
  )
  select * from hour_lines where exists (select 1 from allowed)
  union all
  select * from stipend_lines where exists (select 1 from allowed)
  order by 1, 2, 3;
$$;
revoke all on function public.musician_invoice_lines(uuid, date) from public, anon;
grant execute on function public.musician_invoice_lines(uuid, date) to authenticated;
