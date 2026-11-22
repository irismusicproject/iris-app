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

/** This month's choices for a contract (v0.23): stipend lines left off. Overhead is set on the contract. */
export type MonthOptions = {
  stipends: { id: string; label: string; amount: number; included: boolean }[];
  anySent: boolean;
};

export async function loadPartnerInvoices(agreement: AgreementRow, month: string, seasonStart: string, siteNames: Map<string, string>, billTo: string): Promise<ShownInvoice[]> {
  return (await loadPartnerMonth(agreement, month, seasonStart, siteNames, billTo)).invoices;
}

export async function loadPartnerMonth(
  agreement: AgreementRow,
  month: string,
  seasonStart: string,
  siteNames: Map<string, string>,
  billTo: string,
): Promise<{ invoices: ShownInvoice[]; options: MonthOptions }> {
  const supabase = await createClient();
  const end = monthEnd(month);
  const [{ data: thisMonth }, { data: toDate }, { data: stipends }, { data: frozen }, { data: choice }] = await Promise.all([
    supabase.rpc("partner_billable_minutes", { p_agreement: agreement.id, p_from: month, p_to: end }),
    supabase.rpc("partner_billable_minutes", { p_agreement: agreement.id, p_from: seasonStart, p_to: end }),
    supabase.rpc("partner_billable_stipends", { p_agreement: agreement.id, p_from: month, p_to: end }),
    supabase.from("partner_invoice").select("*").eq("agreement_id", agreement.id).eq("month", month),
    supabase.from("partner_invoice_choice").select("excluded_stipend_ids").eq("agreement_id", agreement.id).eq("month", month).maybeSingle(),
  ]);
  const excluded = new Set<string>((choice?.excluded_stipend_ids as string[] | undefined) ?? []);
  const allStipends = (stipends ?? []) as { id: string; kind: string; due_on: string; amount: number }[];
  const sites = agreement.partner_agreement_site
    .map((s) => ({ id: s.site_id, name: siteNames.get(s.site_id) ?? "Site" }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const drafts = buildPartnerInvoices({
    agreement,
    month,
    sites,
    thisMonth: (thisMonth ?? []) as MinutesRow[],
    toDate: (toDate ?? []) as MinutesRow[],
    stipends: allStipends.filter((s) => !excluded.has(s.id)),
    installmentsDue: agreement.partner_installment.filter((i) => i.due_on >= month && i.due_on <= end),
  });
  type Frozen = { id: string; kind: PartnerInvoiceKind; site_id: string | null; number: string; bill_to: string; lines: InvoiceLine[]; summary: InvoiceSummary; total: number; state: "sent" | "paid"; sent_at: string; paid_at: string | null };
  const frozenRows = (frozen ?? []) as Frozen[];
  const invoices: ShownInvoice[] = drafts.map((d) => {
    const f = frozenRows.find((r) => r.kind === d.kind && r.site_id === d.siteId);
    if (f) return { id: f.id, kind: d.kind, siteId: d.siteId, label: d.label, number: f.number, billTo: f.bill_to, lines: f.lines, summary: f.summary, total: Number(f.total), state: f.state, sentAt: f.sent_at, paidAt: f.paid_at };
    return { id: null, kind: d.kind, siteId: d.siteId, label: d.label, number: partnerInvoiceNumber(month, d.label, d.kind), billTo, lines: d.lines, summary: d.summary, total: d.total, state: "draft" as const, sentAt: null, paidAt: null };
  });
  // Frozen invoices that the live draft no longer produces (e.g. overhead
  // turned off after sending) still show.
  for (const f of frozenRows)
    if (!invoices.some((i) => i.kind === f.kind && i.siteId === f.site_id))
      invoices.push({ id: f.id, kind: f.kind, siteId: f.site_id, label: f.site_id ? siteNames.get(f.site_id) ?? "Site" : `${agreement.name}: ${f.kind}`, number: f.number, billTo: f.bill_to, lines: f.lines, summary: f.summary, total: Number(f.total), state: f.state, sentAt: f.sent_at, paidAt: f.paid_at });
  const kindLabel = (k: string) => `${k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} stipend`;
  return {
    invoices,
    options: {
      stipends: allStipends.map((s) => ({ id: s.id, label: `${kindLabel(s.kind)} (due ${s.due_on})`, amount: Number(s.amount), included: !excluded.has(s.id) })),
      anySent: frozenRows.length > 0,
    },
  };
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
