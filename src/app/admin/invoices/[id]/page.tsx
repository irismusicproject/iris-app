import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomLine } from "@/shared/domain/partner-invoice";
import { CustomInvoiceForm } from "../custom-invoice-form";

export const metadata = { title: "Custom invoice · Iris Music Project" };

export default async function CustomInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: inv }, { data: residencies }] = await Promise.all([
    supabase.from("custom_invoice").select("*").eq("id", id).maybeSingle(),
    supabase.from("residency").select("id, name").order("name"),
  ]);
  if (!inv) notFound();
  const state = inv.state as "draft" | "sent" | "paid";
  return (
    <AppShell isAdmin={isAdmin}>
      <Link href="/admin/invoices" className="text-sm text-muted hover:text-foreground">← Invoices</Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {inv.number}</h1>
        <div className="flex gap-2 text-sm">
          <a href={`/admin/invoices/${id}/pdf?view=1`} target="_blank" rel="noreferrer" className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">View PDF</a>
          <a href={`/admin/invoices/${id}/pdf`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">Download PDF</a>
        </div>
      </div>
      <p className="text-muted">{state === "paid" ? "Paid" : state === "sent" ? "Sent: it can't be changed now" : "Draft"}</p>
      <div className="mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <CustomInvoiceForm
          id={id}
          title={inv.title}
          invoiceDate={inv.invoice_date}
          residencyId={inv.residency_id}
          billTo={inv.bill_to}
          lines={inv.lines as CustomLine[]}
          residencies={(residencies ?? []).map((p) => ({ id: p.id, name: p.name }))}
          state={state}
        />
      </div>
    </AppShell>
  );
}
