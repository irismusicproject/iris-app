"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getBillTo, loadPartnerInvoices, type AgreementRow } from "@/lib/partner-invoices";
import { createClient } from "@/lib/supabase/server";

// Community invoices (v0.22): admins set up contracts and send invoices.
// Every rule is enforced again by Row Level Security (admins only).

export type BillingResult = { status: "idle" | "saved" | "error"; message?: string };
const ok: BillingResult = { status: "saved" };
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const fail = (e: { message: string }): BillingResult => {
  console.error("billing change failed:", e.message);
  return { status: "error", message: e.message.includes("contract can only") ? "Pick sites from this program." : "We couldn't save that. Please try again." };
};
const refresh = (residencyId: string) => revalidatePath(`/residencies/${residencyId}/billing`);

export type AgreementInput = {
  name: string;
  billingBasis: "per_hour" | "installments";
  hourlyRate: number | null;
  contractedHours: number | null;
  billStipends: boolean;
  overheadPercent: number | null;
  overheadBilling: "same_invoice" | "separate_invoice";
  billLateCancellations: boolean;
  siteIds: string[];
};

export async function saveAgreement(residencyId: string, seasonId: string, agreementId: string | null, input: AgreementInput): Promise<BillingResult> {
  await requireAdmin();
  if (!input.name.trim()) return { status: "error", message: "Give the contract a name." };
  if (!input.siteIds.length || !input.siteIds.every(isId)) return { status: "error", message: "Pick at least one site." };
  if (input.billingBasis === "per_hour" && (input.hourlyRate === null || !(input.hourlyRate >= 0))) return { status: "error", message: "Enter the hourly rate." };
  if (input.overheadPercent !== null && !(input.overheadPercent >= 0 && input.overheadPercent <= 100)) return { status: "error", message: "Overhead is a percent from 0 to 100." };
  const supabase = await createClient();
  const row = {
    residency_id: residencyId,
    season_id: seasonId,
    name: input.name.trim(),
    billing_basis: input.billingBasis,
    hourly_rate: input.hourlyRate,
    contracted_hours: input.contractedHours,
    bill_stipends: input.billStipends,
    overhead_percent: input.overheadPercent,
    overhead_billing: input.overheadBilling,
    bill_late_cancellations: input.billLateCancellations,
  };
  let id = agreementId;
  if (id) {
    const { error } = await supabase.from("partner_agreement").update(row).eq("id", id);
    if (error) return fail(error);
    const { error: e2 } = await supabase.from("partner_agreement_site").delete().eq("agreement_id", id);
    if (e2) return fail(e2);
  } else {
    const { data, error } = await supabase.from("partner_agreement").insert(row).select("id").single();
    if (error) return fail(error);
    id = data.id as string;
  }
  const { error: e3 } = await supabase.from("partner_agreement_site").insert(input.siteIds.map((site_id) => ({ agreement_id: id, site_id })));
  if (e3) return fail(e3);
  refresh(residencyId);
  return ok;
}

export async function addPartnerInstallment(residencyId: string, agreementId: string, dueOn: string, amount: number): Promise<BillingResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || !(amount > 0)) return { status: "error", message: "Enter a due date and an amount." };
  const supabase = await createClient();
  const { error } = await supabase.from("partner_installment").insert({ agreement_id: agreementId, due_on: dueOn, amount: Math.round(amount * 100) / 100 });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

export async function removePartnerInstallment(residencyId: string, installmentId: string): Promise<BillingResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("partner_installment").delete().eq("id", installmentId);
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

/** Freeze the current draft: its lines and total never change after this. */
export async function markInvoiceSent(residencyId: string, agreementId: string, month: string, kind: string, siteId: string | null): Promise<BillingResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { status: "error", message: "Pick a month." };
  const supabase = await createClient();
  const { data: agreement } = await supabase
    .from("partner_agreement")
    .select("*, partner_agreement_site(site_id), partner_installment(id, due_on, amount), season(starts_on)")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { status: "error", message: "That contract wasn't found." };
  const siteIds = (agreement.partner_agreement_site as { site_id: string }[]).map((s) => s.site_id);
  const { data: siteRows } = await supabase.from("site").select("id, display_name").in("id", siteIds);
  const names = new Map((siteRows ?? []).map((s) => [s.id as string, s.display_name as string]));
  const invoices = await loadPartnerInvoices(agreement as unknown as AgreementRow, month, (agreement.season as { starts_on: string }).starts_on, names, await getBillTo(residencyId));
  const inv = invoices.find((i) => i.kind === kind && i.siteId === siteId);
  if (!inv) return { status: "error", message: "That invoice isn't there anymore. Refresh the page." };
  if (inv.id) return { status: "error", message: "That invoice was already sent." };
  const { error } = await supabase.from("partner_invoice").insert({
    agreement_id: agreementId,
    kind: inv.kind,
    site_id: inv.siteId,
    month,
    number: inv.number,
    bill_to: inv.billTo,
    lines: inv.lines,
    summary: inv.summary,
    total: inv.total,
  });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

export async function setInvoicePaid(residencyId: string, invoiceId: string, paid: boolean): Promise<BillingResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("partner_invoice").update({ state: paid ? "paid" : "sent" }).eq("id", invoiceId);
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

/** This month's choices for a contract (v0.23): stipend lines to leave off. */
export async function setMonthChoices(residencyId: string, agreementId: string, month: string, excludedStipendIds: string[]): Promise<BillingResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-01$/.test(month) || !excludedStipendIds.every(isId)) return { status: "error", message: "Pick a month." };
  const supabase = await createClient();
  const { count } = await supabase.from("partner_invoice").select("id", { count: "exact", head: true }).eq("agreement_id", agreementId).eq("month", month);
  if (count) return { status: "error", message: "An invoice for this month was already sent, so its lines are frozen." };
  const { error } = await supabase
    .from("partner_invoice_choice")
    .upsert({ agreement_id: agreementId, month, excluded_stipend_ids: excludedStipendIds }, { onConflict: "agreement_id,month" });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}
