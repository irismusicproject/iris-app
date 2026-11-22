-- Community invoice options (DOMAIN-MODEL v0.23; decided by Lauren Nov 22,
-- 2026). Admins only.
--
-- 1. Each month, before sending, an admin can leave individual stipend
--    lines off (partner_invoice_choice). Overhead is switched on or off on
--    the contract itself (overhead_percent empty = off).
-- 2. Custom invoices: typed by hand for work outside a contract (a concert
--    for a non-partner, a corporate office's overhead...). Optionally linked
--    to a program. Draft -> sent (frozen) -> paid.

-- 1 ---------------------------------------------------------------------------
create table public.partner_invoice_choice (
  id                   uuid not null default gen_random_uuid() unique,
  agreement_id         uuid not null references public.partner_agreement (id) on delete cascade,
  month                date not null check (extract(day from month) = 1),
  excluded_stipend_ids uuid[] not null default '{}',
  updated_at           timestamptz not null default now(),
  primary key (agreement_id, month)
);
create trigger partner_invoice_choice_set_updated_at before update on public.partner_invoice_choice for each row execute function public.set_updated_at();
create trigger partner_invoice_choice_audit after insert or update on public.partner_invoice_choice for each row execute function public.write_audit_log();
alter table public.partner_invoice_choice enable row level security;
revoke all on public.partner_invoice_choice from anon, authenticated;
grant select, insert, update on public.partner_invoice_choice to authenticated;
create policy "partner_invoice_choice: admins" on public.partner_invoice_choice for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Stipend lines need their ids so a month can leave one off.
drop function public.partner_billable_stipends(uuid, date, date);
create function public.partner_billable_stipends(p_agreement uuid, p_from date, p_to date)
returns table (id uuid, kind text, due_on date, amount numeric)
language sql stable security definer set search_path = ''
as $$
  select si.id, si.kind::text, si.due_on, si.amount
  from public.partner_agreement pa
  join public.contract c on c.season_id = pa.season_id
  join public.stipend_installment si on si.contract_id = c.id
  where pa.id = p_agreement and pa.bill_stipends and public.is_admin()
    and si.due_on between p_from and p_to
  order by si.due_on;
$$;
revoke all on function public.partner_billable_stipends(uuid, date, date) from public, anon;
grant execute on function public.partner_billable_stipends(uuid, date, date) to authenticated;

-- 2 ---------------------------------------------------------------------------
create table public.custom_invoice (
  id           uuid primary key default gen_random_uuid(),
  residency_id uuid references public.residency (id) on delete restrict,
  title        text not null check (length(btrim(title)) between 1 and 200),
  invoice_date date not null default current_date,
  number       text not null check (length(number) between 1 and 40),
  bill_to      text not null check (length(btrim(bill_to)) between 1 and 1000),
  lines        jsonb not null default '[]',
  total        numeric(10, 2) not null default 0,
  state        text not null default 'draft' check (state in ('draft', 'sent', 'paid')),
  sent_at      timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index custom_invoice_residency_idx on public.custom_invoice (residency_id, invoice_date);
create trigger custom_invoice_set_updated_at before update on public.custom_invoice for each row execute function public.set_updated_at();
create trigger custom_invoice_audit after insert or update on public.custom_invoice for each row execute function public.write_audit_log();

-- Drafts can change; once sent, only the state can (sent <-> paid).
create function public.custom_invoice_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state <> 'draft' then raise exception 'a new invoice starts as a draft' using errcode = '42501'; end if;
    return new;
  end if;
  if old.state <> 'draft' then
    if new.state = 'draft' then raise exception 'a sent invoice can''t go back to draft' using errcode = '42501'; end if;
    if new.lines is distinct from old.lines or new.total is distinct from old.total or new.bill_to is distinct from old.bill_to
       or new.title is distinct from old.title or new.number is distinct from old.number
       or new.invoice_date is distinct from old.invoice_date or new.residency_id is distinct from old.residency_id then
      raise exception 'a sent invoice can''t be changed' using errcode = '42501';
    end if;
  end if;
  if new.state = 'sent' and old.state = 'draft' then new.sent_at := now(); end if;
  if new.state = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.state = 'sent' then new.paid_at := null; end if;
  return new;
end;
$$;
create trigger custom_invoice_guard before insert or update on public.custom_invoice for each row execute function public.custom_invoice_guard();

alter table public.custom_invoice enable row level security;
revoke all on public.custom_invoice from anon, authenticated;
grant select, insert, update, delete on public.custom_invoice to authenticated;
create policy "custom_invoice: admins" on public.custom_invoice for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Only drafts can be deleted.
create policy "custom_invoice: admins delete drafts" on public.custom_invoice as restrictive for delete to authenticated
  using (state = 'draft');
