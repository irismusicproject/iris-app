"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { customLinesTotal, type CustomLine } from "@/shared/domain/partner-invoice";
import { todayIn } from "@/shared/domain/time";

// Custom invoices (DOMAIN-MODEL v0.23): typed by hand for work outside a
// contract. Admins only (RLS checks too). Drafts change freely; sent ones are
// frozen by the database.

export type CustomResult = { status: "idle" | "saved" | "error"; message?: string };
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const fail = (e: { message: string }): CustomResult => {
  console.error("custom invoice change failed:", e.message);
  return { status: "error", message: e.message.includes("can't") ? e.message.replace(/^.*?: /, "") : "We couldn't save that. Please try again." };
};
const refresh = (id?: string, residencyId?: string | null) => {
  revalidatePath("/admin/invoices");
  if (id) revalidatePath(`/admin/invoices/${id}`);
  if (residencyId) revalidatePath(`/residencies/${residencyId}/billing`);
};

export async function createCustomInvoice(residencyId?: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayIn();
  const { count } = await supabase.from("custom_invoice").select("id", { count: "exact", head: true }).gte("invoice_date", `${today.slice(0, 7)}-01`);
  const { data, error } = await supabase
    .from("custom_invoice")
    .insert({
      residency_id: residencyId && isId(residencyId) ? residencyId : null,
      title: "Concert",
      invoice_date: today,
      number: `IMP-${today.slice(0, 7).replace("-", "")}-C${(count ?? 0) + 1}`,
      bill_to: "Who to bill",
      lines: [],
      total: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error("couldn't create the invoice");
  refresh();
  redirect(`/admin/invoices/${data.id}`);
}

export type CustomInvoiceInput = { title: string; invoiceDate: string; residencyId: string | null; billTo: string; lines: CustomLine[] };

export async function saveCustomInvoice(id: string, input: CustomInvoiceInput): Promise<CustomResult> {
  await requireAdmin();
  if (!input.title.trim()) return { status: "error", message: "Give the invoice a title." };
  if (!input.billTo.trim()) return { status: "error", message: "Enter who to bill." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) return { status: "error", message: "Enter the invoice date." };
  const lines = input.lines
    .filter((l) => l.description.trim())
    .map((l) => ({
      description: l.description.trim().slice(0, 300),
      quantity: l.quantity === null || Number.isNaN(l.quantity) ? null : Math.round(l.quantity * 100) / 100,
      unit_amount: l.unit_amount === null || Number.isNaN(l.unit_amount) ? null : Math.round(l.unit_amount * 100) / 100,
      amount: Math.round((l.quantity != null && l.unit_amount != null ? l.quantity * l.unit_amount : l.amount) * 100) / 100,
    }));
  if (lines.some((l) => !Number.isFinite(l.amount))) return { status: "error", message: "Check the amounts." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("custom_invoice")
    .update({
      title: input.title.trim(),
      invoice_date: input.invoiceDate,
      residency_id: input.residencyId && isId(input.residencyId) ? input.residencyId : null,
      bill_to: input.billTo.trim(),
      lines,
      total: customLinesTotal(lines),
    })
    .eq("id", id);
  if (error) return fail(error);
  refresh(id, input.residencyId);
  return { status: "saved" };
}

export async function setCustomInvoiceState(id: string, state: "sent" | "paid"): Promise<CustomResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("custom_invoice").update({ state }).eq("id", id).select("residency_id").single();
  if (error) return fail(error);
  refresh(id, data.residency_id);
  return { status: "saved" };
}

export async function deleteCustomInvoice(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("custom_invoice").delete().eq("id", id).eq("state", "draft");
  refresh();
  redirect("/admin/invoices");
}
