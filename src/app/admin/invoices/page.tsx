import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { buttonClass } from "@/components/auth-card";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/shared/domain/documentation";
import { createCustomInvoice } from "./actions";

// All invoices (admins, v0.23): custom invoices typed by hand, plus links to
// each program's community invoices.
export const metadata = { title: "Invoices · Iris Music Project" };

export default async function InvoicesAdminPage() {
  const { isAdmin } = await requireAdmin();
  const supabase = await createClient();
  const [{ data: custom }, { data: programs }] = await Promise.all([
    supabase.from("custom_invoice").select("id, number, title, invoice_date, total, state, residency(name)").order("invoice_date", { ascending: false }).limit(100),
    supabase.from("residency").select("id, name").order("name"),
  ]);
  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const badge = (s: string) =>
    `rounded-full px-2 py-0.5 text-xs ${s === "paid" ? "bg-iris-soft text-iris" : s === "sent" ? "border border-iris text-iris" : "border border-brand-orange text-brand-orange"}`;

  return (
    <AppShell isAdmin={isAdmin}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <form action={async () => { "use server"; await createCustomInvoice(); }}>
          <button className={buttonClass}>New custom invoice</button>
        </form>
      </div>
      <p className="mt-1 text-muted">Custom invoices are for work outside a contract: a concert for a non-partner, a corporate office&apos;s overhead, anything else.</p>

      <section className={card}>
        <h2 className="text-lg font-semibold">Custom invoices</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {(custom ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/admin/invoices/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-iris">
                <span>
                  <span className="font-medium">{c.title}</span> · {c.number} · {c.invoice_date}
                  {c.residency ? <span className="text-muted"> · {(c.residency as unknown as { name: string }).name}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {money(Number(c.total))}
                  <span className={badge(c.state)}>{c.state === "paid" ? "Paid" : c.state === "sent" ? "Sent" : "Draft"}</span>
                </span>
              </Link>
            </li>
          ))}
          {(custom ?? []).length === 0 && <li className="py-2 text-muted">None yet.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Community invoices by program</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {(programs ?? []).map((p) => (
            <li key={p.id}><Link href={`/residencies/${p.id}/billing`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">{p.name}</Link></li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
