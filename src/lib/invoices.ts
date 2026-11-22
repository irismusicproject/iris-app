import { createClient } from "@/lib/supabase/server";
import { addDays, payPeriodStart } from "@/shared/domain/documentation";

// Musician invoices (DOMAIN-MODEL section 5, v0.19). Computed live from
// approved hours x contract rate, plus stipend payments due in the period,
// by the database function musician_invoice_lines (contractors only; the
// musician themself or an admin).

export type InvoiceLine = {
  sort: number;
  residency_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_amount: number | null;
  amount: number;
};

export async function getPayPeriodAnchor(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("setting").select("value").eq("key", "pay_period_anchor").maybeSingle();
  return data?.value ?? "2026-11-02";
}

/** The current pay period's start and the ones before it, newest first. */
export function recentPayPeriods(anchor: string, today: string, count: number): string[] {
  const current = payPeriodStart(today, anchor);
  return Array.from({ length: count }, (_, i) => addDays(current, -14 * i)).filter((p) => p >= anchor);
}

export async function getInvoiceLines(personId: string, start: string): Promise<{ lines: InvoiceLine[]; total: number; missingRate: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("musician_invoice_lines", { p_person: personId, p_start: start });
  const lines = ((data ?? []) as InvoiceLine[]).map((l) => ({
    ...l,
    quantity: Number(l.quantity),
    unit_amount: l.unit_amount === null ? null : Number(l.unit_amount),
    amount: Number(l.amount),
  }));
  return {
    lines,
    total: Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100,
    missingRate: lines.some((l) => l.unit === "hours" && l.unit_amount === null),
  };
}

/** e.g. "MC-20261102": the musician's initials and the period start. */
export function invoiceNumber(name: string, start: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);
  return `${initials || "IR"}-${start.replace(/-/g, "")}`;
}
