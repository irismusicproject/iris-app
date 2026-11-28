import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getInvoiceLines, getPayPeriodAnchor, recentPayPeriods } from "@/lib/invoices";
import { formatPayPeriod, money } from "@/shared/domain/documentation";
import { todayIn } from "@/shared/domain/time";

// My invoices (DOMAIN-MODEL section 5, v0.19): one invoice per two-week pay
// period, Monday–Sunday, for contractors. W-2 staff are paid through payroll.
export const metadata = { title: "My invoices · Iris Music Project" };

export default async function InvoicesPage() {
  const { person, isAdmin } = await requirePerson();
  const contractor = person.employment_type === "contractor_1099";
  const today = todayIn();
  const periods = contractor ? recentPayPeriods(await getPayPeriodAnchor(), today, 6) : [];
  const invoices = await Promise.all(periods.map(async (start) => ({ start, ...(await getInvoiceLines(person.id, start)) })));

  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">My invoices</h1>
      {!contractor ? (
        <p className="mt-3 text-muted">You&apos;re paid through payroll, so there are no invoices to send. Keep entering your hours on My week.</p>
      ) : (
        <>
          <p className="mt-1 text-muted">One invoice for each two-week pay period (Monday–Sunday). It fills in as your Iris Supervisor approves your hours.</p>
          <ul className="mt-6 flex flex-col gap-3">
            {invoices.map((inv, i) => (
              <li key={inv.start}>
                <Link href={`/invoices/${inv.start}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4 hover:bg-iris-soft">
                  <span>
                    <span className="font-medium">{formatPayPeriod(inv.start)}</span>
                    {i === 0 && <span className="ml-2 rounded-full border border-brand-orange px-2 py-0.5 text-xs text-brand-orange">In progress</span>}
                  </span>
                  <span className={inv.total ? "font-semibold" : "text-muted"}>{inv.total ? money(inv.total) : "Nothing approved yet"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
