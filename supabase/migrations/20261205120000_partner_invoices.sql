-- Community invoices (DOMAIN-MODEL section 5, v0.22; rules confirmed by
-- Lauren Nov 22, 2026). Admins only.
--
-- PartnerAgreement: the contract Iris bills a partner under, for one season
-- of a residency, covering one or more of its sites. PartnerInvoice: one per
-- contract, per site, per month (D4), plus a separate overhead invoice when
-- the contract asks for one, and one "contract" invoice for stipends and
-- overhead when a contract covers several sites (D9).
--
-- Billable time (revises D9, Nov 22, 2026): PER MUSICIAN. Each musician
-- present x the program's documented length, plus each musician's logged
-- relationship-building minutes at that site; counted only once the point
-- person has approved that musician's week for the residency. Partner
-- cancellations after 9 am that day bill the scheduled length per assigned
-- musician (contract setting). Drafts are computed live; "sent" freezes the
-- lines and total.

create type public.billing_basis as enum ('per_hour', 'installments');
create type public.overhead_billing as enum ('same_invoice', 'separate_invoice');
create type public.partner_invoice_kind as enum ('site', 'overhead', 'contract');
create type public.partner_invoice_state as enum ('sent', 'paid');

create table public.partner_agreement (
  id                     uuid primary key default gen_random_uuid(),
  residency_id           uuid not null references public.residency (id) on delete restrict,
  season_id              uuid not null references public.season (id) on delete restrict,
  name                   text not null check (length(btrim(name)) between 1 and 200),
  billing_basis          public.billing_basis not null default 'per_hour',
  hourly_rate            numeric(8, 2) check (hourly_rate is null or hourly_rate >= 0),
  contracted_hours       numeric(8, 2) check (contracted_hours is null or contracted_hours >= 0),
  bill_stipends          boolean not null default false,
  overhead_percent       numeric(5, 2) check (overhead_percent is null or overhead_percent between 0 and 100),
  overhead_billing       public.overhead_billing not null default 'same_invoice',
  bill_late_cancellations boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (billing_basis <> 'per_hour' or hourly_rate is not null)
);
create index partner_agreement_residency_idx on public.partner_agreement (residency_id, season_id);

create table public.partner_agreement_site (
  agreement_id uuid not null references public.partner_agreement (id) on delete cascade,
  site_id      uuid not null references public.site (id) on delete restrict,
  primary key (agreement_id, site_id)
);

create table public.partner_installment (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.partner_agreement (id) on delete cascade,
  due_on       date not null,
  amount       numeric(10, 2) not null check (amount >= 0)
);

create table public.partner_invoice (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.partner_agreement (id) on delete restrict,
  kind         public.partner_invoice_kind not null,
  site_id      uuid references public.site (id) on delete restrict,
  month        date not null check (extract(day from month) = 1),
  number       text not null check (length(number) between 1 and 40),
  bill_to      text not null check (length(bill_to) <= 1000),
  lines        jsonb not null,
  summary      jsonb not null default '{}',
  total        numeric(10, 2) not null,
  state        public.partner_invoice_state not null default 'sent',
  sent_at      timestamptz not null default now(),
  paid_at      timestamptz,
  updated_at   timestamptz not null default now(),
  check ((kind = 'site') = (site_id is not null))
);
create unique index partner_invoice_once on public.partner_invoice (agreement_id, kind, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

create trigger partner_agreement_set_updated_at before update on public.partner_agreement for each row execute function public.set_updated_at();
create trigger partner_invoice_set_updated_at before update on public.partner_invoice for each row execute function public.set_updated_at();
create trigger partner_agreement_audit after insert or update on public.partner_agreement for each row execute function public.write_audit_log();
create trigger partner_invoice_audit after insert or update on public.partner_invoice for each row execute function public.write_audit_log();

-- A contract's sites must belong to its residency.
create function public.partner_agreement_site_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.partner_agreement pa
    join public.residency_site rs on rs.residency_id = pa.residency_id and rs.site_id = new.site_id
    where pa.id = new.agreement_id
  ) then
    raise exception 'a contract can only cover its program''s sites' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.partner_agreement_site_guard() from public, anon, authenticated;
create trigger partner_agreement_site_guard before insert or update on public.partner_agreement_site
  for each row execute function public.partner_agreement_site_guard();

-- Sent invoices are frozen: only the state (paid) can change.
create function public.partner_invoice_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.lines is distinct from old.lines or new.total is distinct from old.total or new.summary is distinct from old.summary
     or new.agreement_id is distinct from old.agreement_id or new.kind is distinct from old.kind
     or new.site_id is distinct from old.site_id or new.month is distinct from old.month or new.number is distinct from old.number
     or new.bill_to is distinct from old.bill_to then
    raise exception 'a sent invoice can''t be changed' using errcode = '42501';
  end if;
  if new.state = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.state = 'sent' then new.paid_at := null; end if;
  return new;
end;
$$;
create trigger partner_invoice_guard before update on public.partner_invoice for each row execute function public.partner_invoice_guard();

alter table public.partner_agreement enable row level security;
alter table public.partner_agreement_site enable row level security;
alter table public.partner_installment enable row level security;
alter table public.partner_invoice enable row level security;
revoke all on public.partner_agreement, public.partner_agreement_site, public.partner_installment, public.partner_invoice from anon, authenticated;
grant select, insert, update on public.partner_agreement to authenticated;
grant select, insert, delete on public.partner_agreement_site to authenticated;
grant select, insert, delete on public.partner_installment to authenticated;
grant select, insert, update on public.partner_invoice to authenticated;
create policy "partner_agreement: admins" on public.partner_agreement for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "partner_agreement_site: admins" on public.partner_agreement_site for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "partner_installment: admins" on public.partner_installment for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "partner_invoice: admins" on public.partner_invoice for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Billable minutes per site for a contract, between two dates (inclusive)
-- ---------------------------------------------------------------------------
-- category: 'programs', 'relationship_building', 'late_cancellations'.
-- approved_minutes count on the invoice; waiting_minutes are documented or
-- logged but the musician's week isn't approved yet (shown as a warning).
-- undocumented: past programs in the period with no session report yet.
create function public.partner_billable_minutes(p_agreement uuid, p_from date, p_to date)
returns table (site_id uuid, category text, approved_minutes bigint, waiting_minutes bigint, undocumented bigint)
language sql stable security definer set search_path = ''
as $$
  with pa as (
    select a.* from public.partner_agreement a where a.id = p_agreement and public.is_admin()
  ),
  sites as (
    select pas.site_id, st.timezone from public.partner_agreement_site pas
    join public.site st on st.id = pas.site_id
    where pas.agreement_id = p_agreement
  ),
  sess as (
    select se.*, s.site_id, (se.starts_at at time zone s.timezone) as local_start
    from public.session se
    join public.location l on l.id = se.location_id
    join sites s on s.site_id = l.site_id
    join pa on pa.residency_id = se.residency_id
    where se.kind = 'group_session' and se.billable
      and (se.starts_at at time zone s.timezone)::date between p_from and p_to
  ),
  approved_week as (
    select te.person_id, te.week_starting from public.time_entry te
    join pa on pa.residency_id = te.residency_id
    where te.state = 'approved'
    group by te.person_id, te.week_starting
  ),
  program_rows as (
    select se.site_id, r.actual_minutes as minutes,
           exists (select 1 from approved_week w where w.person_id = a.person_id
                   and w.week_starting = se.local_start::date - (extract(isodow from se.local_start)::int - 1)) as approved
    from sess se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
    where se.schedule_state = 'published'
  ),
  rb_rows as (
    select ra.site_id, ra.minutes,
           exists (select 1 from approved_week w where w.person_id = ra.person_id
                   and w.week_starting = ra.occurred_on - (extract(isodow from ra.occurred_on)::int - 1)) as approved
    from public.relationship_activity ra
    join pa on pa.residency_id = ra.residency_id
    join sites s on s.site_id = ra.site_id
    where ra.occurred_on between p_from and p_to
  ),
  late_rows as (
    select se.site_id, coalesce(se.scheduled_minutes, 0) as minutes
    from sess se
    join pa on pa.bill_late_cancellations
    join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
    where se.schedule_state = 'canceled' and se.cancellation_reason = 'partner'
      and se.canceled_at is not null
      and (se.canceled_at at time zone (select s.timezone from sites s where s.site_id = se.site_id))
          >= (se.local_start::date + time '09:00')
  ),
  undoc as (
    select se.site_id, count(*) as n from sess se
    where se.schedule_state = 'published' and se.starts_at <= now()
      and not exists (select 1 from public.session_report r where r.session_id = se.id)
    group by se.site_id
  )
  select s.site_id, c.category,
         coalesce(sum(x.minutes) filter (where x.approved), 0)::bigint,
         coalesce(sum(x.minutes) filter (where not x.approved), 0)::bigint,
         case when c.category = 'programs' then coalesce((select n from undoc u where u.site_id = s.site_id), 0) else 0 end::bigint
  from sites s
  cross join (values ('programs'), ('relationship_building'), ('late_cancellations')) c(category)
  left join (
    select site_id, 'programs' as category, minutes, approved from program_rows
    union all select site_id, 'relationship_building', minutes, approved from rb_rows
    union all select site_id, 'late_cancellations', minutes, true from late_rows
  ) x on x.site_id = s.site_id and x.category = c.category
  where exists (select 1 from pa)
  group by s.site_id, c.category;
$$;
revoke all on function public.partner_billable_minutes(uuid, date, date) from public, anon;
grant execute on function public.partner_billable_minutes(uuid, date, date) to authenticated;

-- Musicians' stipend installments for the contract's season and residency,
-- due between two dates (for contracts that bill stipends). Admins only.
create function public.partner_billable_stipends(p_agreement uuid, p_from date, p_to date)
returns table (kind text, due_on date, amount numeric)
language sql stable security definer set search_path = ''
as $$
  select si.kind::text, si.due_on, si.amount
  from public.partner_agreement pa
  join public.contract c on c.season_id = pa.season_id
  join public.stipend_installment si on si.contract_id = c.id
  where pa.id = p_agreement and pa.bill_stipends and public.is_admin()
    and si.due_on between p_from and p_to
  order by si.due_on;
$$;
revoke all on function public.partner_billable_stipends(uuid, date, date) from public, anon;
grant execute on function public.partner_billable_stipends(uuid, date, date) to authenticated;
