-- Fixes for six rule gaps found by the overnight database tests (PR #50,
-- Ryan's side, Nov 22, 2026). Each follows a rule DOMAIN-MODEL already
-- states; nothing is removed, and the app's current writes still pass.
--   B1  Deactivated people can't read or change their own hours, activities
--       or invoice (Person: "hides all data from that person at once", R9.5).
--   B3  A month's invoice choices can't change once that month is invoiced
--       (PartnerInvoiceChoice: "Can't change once an invoice for that month
--       is sent").
--   B4  Stipend and partner installments are audited (AuditLog: every change
--       to contracts and invoices).
--   B6  Moving an activity checks the same roster rule as logging one.
--   B7  A site invoice's site must be on its contract (D4).
--   B8  A stored invoice total must equal the sum of its lines.
-- Not here: B2 (one session billed under two contracts) and B5 (logging
-- resident views) need design decisions.

-- B1 + B6: relationship_activity -------------------------------------------
drop policy "relationship_activity: own, point person, admins read" on public.relationship_activity;
create policy "relationship_activity: own, point person, admins read" on public.relationship_activity for select to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person')));
drop policy "relationship_activity: own updates" on public.relationship_activity;
create policy "relationship_activity: own updates" on public.relationship_activity for update to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin()))
  with check ((person_id = (select auth.uid()) and (select public.is_active_person())
               and (select public.is_on_current_roster(residency_id)))
              or (select public.is_admin()));
drop policy "relationship_activity: own deletes" on public.relationship_activity;
create policy "relationship_activity: own deletes" on public.relationship_activity for delete to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin()));

-- B1: time_entry -------------------------------------------------------------
drop policy "time_entry: own, point person, admins read" on public.time_entry;
create policy "time_entry: own, point person, admins read" on public.time_entry for select to authenticated
  using ((person_id = (select auth.uid()) and (select public.is_active_person())) or (select public.is_admin())
         or (select public.is_current_staff(residency_id, 'point_person')));
drop policy "time_entry: musicians update their own" on public.time_entry;
create policy "time_entry: musicians update their own" on public.time_entry for update to authenticated
  using (person_id = (select auth.uid()) and (select public.is_active_person()) and state <> 'approved')
  with check (person_id = (select auth.uid()) and (select public.is_active_person()));

-- B1: musician_invoice_lines --------------------------------------------------
create or replace function public.musician_invoice_lines(p_person uuid, p_start date)
returns table (sort integer, residency_name text, description text, quantity numeric, unit text, unit_amount numeric, amount numeric)
language sql stable security definer set search_path = ''
as $$
  with allowed as (
    select 1 from public.person p
    where p.id = p_person and p.employment_type = 'contractor_1099'
      and ((p_person = (select auth.uid()) and public.is_active_person()) or public.is_admin())
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

-- B3: invoice choices freeze once the month is invoiced ---------------------
create function public.partner_invoice_choice_frozen_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.partner_invoice pi
             where pi.agreement_id = coalesce(new.agreement_id, old.agreement_id)
               and pi.month = coalesce(new.month, old.month)) then
    raise exception 'this month''s invoice has been sent; its choices can''t change' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger partner_invoice_choice_frozen before insert or update or delete on public.partner_invoice_choice
  for each row execute function public.partner_invoice_choice_frozen_guard();

-- B4: audit installments (inserts and updates; deletes need audit_log to
-- accept 'delete', which waits on the B5 decision) --------------------------
create trigger stipend_installment_audit after insert or update on public.stipend_installment
  for each row execute function public.write_audit_log();
create trigger partner_installment_audit after insert or update on public.partner_installment
  for each row execute function public.write_audit_log();

-- B7 + B8: partner invoices ------------------------------------------------
create function public.invoice_lines_total(p_lines jsonb)
returns numeric language sql immutable set search_path = ''
as $$
  select coalesce(round(sum((l->>'amount')::numeric), 2), 0)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l;
$$;

create function public.partner_invoice_integrity_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'site' and not exists (
    select 1 from public.partner_agreement_site pas
    where pas.agreement_id = new.agreement_id and pas.site_id = new.site_id
  ) then
    raise exception 'that site isn''t on this contract' using errcode = '23514';
  end if;
  if abs(new.total - public.invoice_lines_total(new.lines)) >= 0.005 then
    raise exception 'the invoice total must equal the sum of its lines' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger partner_invoice_integrity before insert or update on public.partner_invoice
  for each row execute function public.partner_invoice_integrity_guard();

-- B8: custom invoices --------------------------------------------------------
create function public.custom_invoice_total_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if abs(new.total - public.invoice_lines_total(new.lines)) >= 0.005 then
    raise exception 'the invoice total must equal the sum of its lines' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger custom_invoice_total before insert or update on public.custom_invoice
  for each row execute function public.custom_invoice_total_guard();
