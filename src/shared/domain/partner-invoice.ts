// Community invoices (PartnerAgreement, PartnerInvoice; DOMAIN-MODEL
// section 5, v0.22). The database decides which minutes count
// (partner_billable_minutes: per musician, after the point person approves
// the week); this module turns them into invoice lines. Native apps can
// import it.

export type BillingBasis = "per_hour" | "installments";
export type OverheadBilling = "same_invoice" | "separate_invoice";
export type PartnerInvoiceKind = "site" | "overhead" | "contract";

export type Agreement = {
  id: string;
  name: string;
  billing_basis: BillingBasis;
  hourly_rate: number | null;
  contracted_hours: number | null;
  bill_stipends: boolean;
  overhead_percent: number | null;
  overhead_billing: OverheadBilling;
  bill_late_cancellations: boolean;
};

export type MinutesRow = { site_id: string; category: "programs" | "relationship_building" | "late_cancellations"; approved_minutes: number; waiting_minutes: number; undocumented: number };
export type InvoiceLine = { description: string; quantity: number | null; unit: string | null; unit_amount: number | null; amount: number };
export type InvoiceSummary = {
  hoursThisMonth: number;
  hoursToDate: number;
  contractedHours: number | null;
  waitingHours: number;
  undocumented: number;
};
export type InvoiceDraft = { kind: PartnerInvoiceKind; siteId: string | null; label: string; lines: InvoiceLine[]; total: number; summary: InvoiceSummary };

const round2 = (n: number) => Math.round(n * 100) / 100;
const hours = (minutes: number) => round2(minutes / 60);
const stipendLabel = (k: string) => `${k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} stipend`;

export const BILLING_BASIS_LABELS: Record<BillingBasis, string> = { per_hour: "Per hour", installments: "Installments" };
export const OVERHEAD_BILLING_LABELS: Record<OverheadBilling, string> = { same_invoice: "On the same invoice", separate_invoice: "Separate invoice (e.g. corporate office)" };

/** "November 2026" from "2026-11-01". */
export function formatInvoiceMonth(month: string): string {
  return new Date(`${month}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}
export function monthEnd(month: string): string {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * All invoices for one contract and month (D4, D9):
 * - one `site` invoice per site: program and relationship-building hours
 *   (per_hour) or the installment due (installments), late partner
 *   cancellations, and, for a one-site contract, stipends and same-invoice
 *   overhead;
 * - a `contract` invoice for stipends and same-invoice overhead when the
 *   contract covers several sites;
 * - an `overhead` invoice when overhead is billed separately.
 * Overhead applies to billable hours (or installments) plus billed stipends.
 */
export function buildPartnerInvoices(input: {
  agreement: Agreement;
  month: string;
  sites: { id: string; name: string }[];
  thisMonth: MinutesRow[];
  toDate: MinutesRow[];
  stipends: { kind: string; due_on: string; amount: number }[];
  installmentsDue: { due_on: string; amount: number }[];
}): InvoiceDraft[] {
  const { agreement: a, month, sites } = input;
  const monthName = formatInvoiceMonth(month);
  const rate = Number(a.hourly_rate ?? 0);
  const multi = sites.length > 1;
  const sum = (rows: MinutesRow[], siteId: string | null, key: "approved_minutes" | "waiting_minutes" | "undocumented", cats?: MinutesRow["category"][]) =>
    rows.filter((r) => (siteId === null || r.site_id === siteId) && (!cats || cats.includes(r.category))).reduce((n, r) => n + Number(r[key]), 0);
  const worked: MinutesRow["category"][] = ["programs", "relationship_building"];
  const summaryFor = (siteId: string | null): InvoiceSummary => ({
    hoursThisMonth: hours(sum(input.thisMonth, siteId, "approved_minutes", worked)),
    hoursToDate: hours(sum(input.toDate, siteId, "approved_minutes", worked)),
    contractedHours: a.contracted_hours === null ? null : Number(a.contracted_hours),
    waitingHours: hours(sum(input.thisMonth, siteId, "waiting_minutes", worked)),
    undocumented: sum(input.thisMonth, siteId, "undocumented"),
  });

  const stipendLines: InvoiceLine[] = input.stipends.map((s) => ({ description: `${stipendLabel(s.kind)} (due ${s.due_on})`, quantity: null, unit: null, unit_amount: null, amount: round2(Number(s.amount)) }));
  const stipendTotal = stipendLines.reduce((n, l) => n + l.amount, 0);
  const installmentTotal = input.installmentsDue.reduce((n, i) => n + Number(i.amount), 0);
  const pct = Number(a.overhead_percent ?? 0);

  let overheadBase = stipendTotal + (a.billing_basis === "installments" ? installmentTotal : 0);
  const out: InvoiceDraft[] = [];

  for (const site of sites) {
    const lines: InvoiceLine[] = [];
    const m = (cat: MinutesRow["category"]) => sum(input.thisMonth, site.id, "approved_minutes", [cat]);
    if (a.billing_basis === "per_hour") {
      const rows: [string, MinutesRow["category"]][] = [
        [`Programs, ${site.name}, ${monthName}`, "programs"],
        [`Relationship building, ${site.name}, ${monthName}`, "relationship_building"],
      ];
      if (a.bill_late_cancellations && m("late_cancellations") > 0) rows.push([`Late cancellations by the community, ${monthName}`, "late_cancellations"]);
      for (const [description, cat] of rows) {
        const q = hours(m(cat));
        lines.push({ description, quantity: q, unit: "hours", unit_amount: rate, amount: round2(q * rate) });
        overheadBase += round2(q * rate);
      }
    } else if (!multi || site === sites[0]) {
      // Installments: the payment due this month, once per contract.
      if (input.installmentsDue.length === 0) lines.push({ description: `No installment due in ${monthName}`, quantity: null, unit: null, unit_amount: null, amount: 0 });
      for (const i of input.installmentsDue) lines.push({ description: `Installment due ${i.due_on}`, quantity: null, unit: null, unit_amount: null, amount: round2(Number(i.amount)) });
    }
    if (!multi) lines.push(...stipendLines);
    out.push({ kind: "site", siteId: site.id, label: site.name, lines, total: 0, summary: summaryFor(site.id) });
  }

  const overheadLine: InvoiceLine | null = pct > 0 ? { description: `Overhead (${pct}%)`, quantity: null, unit: null, unit_amount: null, amount: round2((overheadBase * pct) / 100) } : null;
  if (overheadLine && a.overhead_billing === "same_invoice" && !multi) out[0]?.lines.push(overheadLine);
  if (multi && (stipendLines.length || (overheadLine && a.overhead_billing === "same_invoice"))) {
    const lines = [...stipendLines, ...(overheadLine && a.overhead_billing === "same_invoice" ? [overheadLine] : [])];
    out.push({ kind: "contract", siteId: null, label: `${a.name}: stipends and overhead`, lines, total: 0, summary: summaryFor(null) });
  }
  if (overheadLine && a.overhead_billing === "separate_invoice") {
    out.push({ kind: "overhead", siteId: null, label: `${a.name}: overhead`, lines: [overheadLine], total: 0, summary: summaryFor(null) });
  }
  for (const inv of out) inv.total = round2(inv.lines.reduce((n, l) => n + l.amount, 0));
  return out;
}

/** e.g. "IMP-202611-MH": month and a short site or invoice tag. */
export function partnerInvoiceNumber(month: string, label: string, kind: PartnerInvoiceKind): string {
  const tag = kind === "overhead" ? "OH" : kind === "contract" ? "CT" : label.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 4) || "S";
  return `IMP-${month.slice(0, 7).replace("-", "")}-${tag}`;
}
