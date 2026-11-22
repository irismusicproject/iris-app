import { createClient } from "@/lib/supabase/server";
import {
  buildPartnerInvoices,
  monthEnd,
  partnerInvoiceNumber,
  type Agreement,
  type InvoiceLine,
  type InvoiceSummary,
  type MinutesRow,
  type PartnerInvoiceKind,
} from "@/shared/domain/partner-invoice";

// Loads a contract's invoices for a month: the frozen copy once sent, a live
// draft otherwise (v0.22). Admins only (RLS and the database functions check).

export type AgreementRow = Agreement & {
  residency_id: string;
  season_id: string;
  partner_agreement_site: { site_id: string }[];
  partner_installment: { id: string; due_on: string; amount: number }[];
};

export type ShownInvoice = {
  id: string | null;
  kind: PartnerInvoiceKind;
  siteId: string | null;
  label: string;
  number: string;
  billTo: string;
  lines: InvoiceLine[];
  summary: InvoiceSummary;
  total: number;
  state: "draft" | "sent" | "paid";
  sentAt: string | null;
  paidAt: string | null;
};

export async function getBillTo(residencyId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("residency").select("partner(legal_name, billing_address, billing_email)").eq("id", residencyId).maybeSingle();
  const p = (data?.partner ?? null) as unknown as { legal_name: string; billing_address: string | null; billing_email: string | null } | null;
  return [p?.legal_name, p?.billing_address, p?.billing_email].filter(Boolean).join("\n");
}

export async function loadPartnerInvoices(agreement: AgreementRow, month: string, seasonStart: string, siteNames: Map<string, string>, billTo: string): Promise<ShownInvoice[]> {
  const supabase = await createClient();
  const end = monthEnd(month);
  const [{ data: thisMonth }, { data: toDate }, { data: stipends }, { data: frozen }] = await Promise.all([
    supabase.rpc("partner_billable_minutes", { p_agreement: agreement.id, p_from: month, p_to: end }),
    supabase.rpc("partner_billable_minutes", { p_agreement: agreement.id, p_from: seasonStart, p_to: end }),
    supabase.rpc("partner_billable_stipends", { p_agreement: agreement.id, p_from: month, p_to: end }),
    supabase.from("partner_invoice").select("*").eq("agreement_id", agreement.id).eq("month", month),
  ]);
  const sites = agreement.partner_agreement_site
    .map((s) => ({ id: s.site_id, name: siteNames.get(s.site_id) ?? "Site" }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const drafts = buildPartnerInvoices({
    agreement,
    month,
    sites,
    thisMonth: (thisMonth ?? []) as MinutesRow[],
    toDate: (toDate ?? []) as MinutesRow[],
    stipends: (stipends ?? []) as { kind: string; due_on: string; amount: number }[],
    installmentsDue: agreement.partner_installment.filter((i) => i.due_on >= month && i.due_on <= end),
  });
  type Frozen = { id: string; kind: PartnerInvoiceKind; site_id: string | null; number: string; bill_to: string; lines: InvoiceLine[]; summary: InvoiceSummary; total: number; state: "sent" | "paid"; sent_at: string; paid_at: string | null };
  const frozenRows = (frozen ?? []) as Frozen[];
  return drafts.map((d) => {
    const f = frozenRows.find((r) => r.kind === d.kind && r.site_id === d.siteId);
    if (f) return { id: f.id, kind: d.kind, siteId: d.siteId, label: d.label, number: f.number, billTo: f.bill_to, lines: f.lines, summary: f.summary, total: Number(f.total), state: f.state, sentAt: f.sent_at, paidAt: f.paid_at };
    return { id: null, kind: d.kind, siteId: d.siteId, label: d.label, number: partnerInvoiceNumber(month, d.label, d.kind), billTo, lines: d.lines, summary: d.summary, total: d.total, state: "draft" as const, sentAt: null, paidAt: null };
  });
}

export async function getAgreements(residencyId: string, seasonId: string): Promise<AgreementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("partner_agreement")
    .select("*, partner_agreement_site(site_id), partner_installment(id, due_on, amount)")
    .eq("residency_id", residencyId)
    .eq("season_id", seasonId)
    .order("created_at");
  return (data ?? []) as AgreementRow[];
}
