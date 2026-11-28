import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getInvoiceLines, getPayPeriodAnchor, invoiceNumber } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatPayPeriod, money, payPeriodStart } from "@/shared/domain/documentation";

export const metadata = { title: "Invoice · Iris Music Project" };

export default async function InvoicePage({ params }: { params: Promise<{ start: string }> }) {
  const { person, isAdmin } = await requirePerson();
  const { start } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || person.employment_type !== "contractor_1099") notFound();
  if (payPeriodStart(start, await getPayPeriodAnchor()) !== start) notFound();

  const supabase = await createClient();
  const [{ lines, total, missingRate }, { data: waiting }] = await Promise.all([
    getInvoiceLines(person.id, start),
    supabase
      .from("time_entry")
      .select("hours, state")
      .eq("person_id", person.id)
      .in("week_starting", [start, addDays(start, 7)])
      .neq("state", "approved"),
  ]);
  const waitingHours = (waiting ?? []).reduce((n, e) => n + Number(e.hours), 0);
  const cell = "px-3 py-2";

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href="/invoices" className="text-sm text-muted hover:text-foreground">← My invoices</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoice {invoiceNumber(person.name, start)}</h1>
          <p className="text-muted">{formatPayPeriod(start)} · Bill to Iris Music Project</p>
        </div>
        {lines.length > 0 && (
          <div className="flex gap-2 text-sm">
            <a href={`/invoices/${start}/pdf?view=1`} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2 hover:bg-iris-soft">View PDF</a>
            <a href={`/invoices/${start}/pdf`} className="rounded-full bg-iris px-4 py-2 font-medium text-white hover:bg-iris-strong dark:text-background">Download PDF</a>
          </div>
        )}
      </div>

      {waitingHours > 0 && (
        <p className="mt-4 rounded-lg border border-brand-orange/60 p-3 text-sm">
          {waitingHours} hours in this period aren&apos;t approved yet, so they&apos;re not on this invoice. They&apos;ll appear once your Iris Supervisor approves them.
        </p>
      )}
      {missingRate && <p className="mt-4 rounded-lg border border-brand-orange/60 p-3 text-sm">Your hourly rate isn&apos;t set for one of these programs yet. Ask an admin.</p>}

      {lines.length === 0 ? (
        <p className="mt-6 text-muted">Nothing approved for this pay period yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-iris-soft text-left">
              <tr>
                <th className={cell}>Program</th>
                <th className={cell}>Description</th>
                <th className={`${cell} text-right`}>Qty</th>
                <th className={`${cell} text-right`}>Rate</th>
                <th className={`${cell} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className={cell}>{l.residency_name}</td>
                  <td className={cell}>{l.description}</td>
                  <td className={`${cell} text-right`}>{l.unit === "hours" ? `${l.quantity} hrs` : l.quantity}</td>
                  <td className={`${cell} text-right`}>{l.unit_amount === null ? "—" : money(l.unit_amount)}</td>
                  <td className={`${cell} text-right`}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-purple font-semibold">
                <td className={cell} colSpan={4}>Total due</td>
                <td className={`${cell} text-right`}>{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AppShell>
  );
}
