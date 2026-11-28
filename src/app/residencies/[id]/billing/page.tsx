import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { getAgreements, getBillTo, loadPartnerMonth } from "@/lib/partner-invoices";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/shared/domain/documentation";
import { BILLING_BASIS_LABELS, formatInvoiceMonth } from "@/shared/domain/partner-invoice";
import { createCustomInvoice } from "@/app/admin/invoices/actions";
import { AgreementForm, InstallmentEditor, InvoiceActions, MonthChoices } from "./billing-controls";

// Community invoices (DOMAIN-MODEL section 5, v0.22): one per contract, per
// site, per month (D4). Admins only. Hours count per musician once the point
// person approves the musician's week.
export const metadata = { title: "Billing · Iris Music Project" };

const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by, 1);
  return d.toISOString().slice(0, 10);
};

export default async function BillingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { isAdmin } = await requireAdmin();
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : `${new Date().toISOString().slice(0, 7)}-01`;

  const supabase = await createClient();
  const [{ data: residency }, { data: siteRows }, { data: seasons }] = await Promise.all([
    supabase.from("residency").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("residency_site").select("site(id, display_name)").eq("residency_id", id),
    supabase.from("season").select("id, name, starts_on, ends_on").eq("residency_id", id).order("starts_on"),
  ]);
  if (!residency) notFound();
  const sites = (siteRows ?? []).map((r) => r.site as unknown as { id: string; display_name: string }).filter(Boolean).map((s) => ({ id: s.id, name: s.display_name }));
  const siteNames = new Map(sites.map((s) => [s.id, s.name]));
  const season = (seasons ?? []).find((s) => s.starts_on <= shiftMonth(month, 1) && s.ends_on >= month);
  const agreements = season ? await getAgreements(id, season.id) : [];
  const billTo = await getBillTo(id);
  const { data: customRows } = await supabase
    .from("custom_invoice")
    .select("id, number, title, invoice_date, total, state")
    .eq("residency_id", id)
    .gte("invoice_date", month)
    .lt("invoice_date", shiftMonth(month, 1))
    .order("invoice_date");
  const months = await Promise.all(agreements.map((a) => loadPartnerMonth(a, month, season!.starts_on, siteNames, billTo)));

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const nav = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft";
  const cell = "px-3 py-2";
  const ym = (m: string) => m.slice(0, 7);

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Community invoices</h1>
          <p className="text-muted">{formatInvoiceMonth(month)}{season ? ` · ${season.name}` : ""}</p>
        </div>
        <nav className="flex gap-2" aria-label="Months">
          <Link href={`/residencies/${id}/billing?month=${ym(shiftMonth(month, -1))}`} className={nav}>← Previous month</Link>
          <Link href={`/residencies/${id}/billing?month=${ym(shiftMonth(month, 1))}`} className={nav}>Next month →</Link>
        </nav>
      </div>
      <p className="mt-2 text-sm text-muted">
        Hours count per musician: each musician present × the program&apos;s documented length, plus their relationship building at the site, once
        the Iris Supervisor approves their week. Drafts update live; &ldquo;Mark as sent&rdquo; freezes an invoice.
      </p>

      {!season && <p className="mt-6 text-muted">No season covers this month.</p>}

      {season &&
        agreements.map((a, i) => (
          <section key={a.id} className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{a.name}</h2>
              <span className="text-sm text-muted">
                {BILLING_BASIS_LABELS[a.billing_basis]}
                {a.billing_basis === "per_hour" && a.hourly_rate != null ? ` · ${money(Number(a.hourly_rate))}/hr` : ""}
                {a.overhead_percent ? ` · ${Number(a.overhead_percent)}% overhead` : ""}
                {` · ${a.partner_agreement_site.map((s) => siteNames.get(s.site_id)).join(", ")}`}
              </span>
            </div>

            <div className="mt-4">
              <MonthChoices
                key={`${a.id}-${month}-${JSON.stringify(months[i]!.options)}`}
                residencyId={id}
                agreementId={a.id}
                month={month}
                stipends={months[i]!.options.stipends}
                locked={months[i]!.options.anySent}
              />
            </div>
            <ul className="mt-4 flex flex-col gap-5">
              {months[i]!.invoices.map((inv) => {
                const q = new URLSearchParams({ agreement: a.id, month: ym(month), kind: inv.kind, ...(inv.siteId ? { site: inv.siteId } : {}) });
                return (
                  <li key={`${inv.kind}-${inv.siteId}`} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{inv.label} <span className="text-sm font-normal text-muted">· {inv.number}</span></span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${inv.state === "paid" ? "bg-iris-soft text-iris" : inv.state === "sent" ? "border border-iris text-iris" : "border border-brand-orange text-brand-orange"}`}>
                        {inv.state === "paid" ? "Paid" : inv.state === "sent" ? "Sent" : "Draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Hours this month {inv.summary.hoursThisMonth} · season to date {inv.summary.hoursToDate}
                      {inv.summary.contractedHours != null ? ` of ${inv.summary.contractedHours} contracted` : ""}
                    </p>
                    {inv.state === "draft" && (inv.summary.waitingHours > 0 || inv.summary.undocumented > 0) && (
                      <p className="mt-2 rounded-lg border border-brand-orange/60 p-2 text-sm">
                        Not on this invoice yet:
                        {inv.summary.waitingHours > 0 && ` ${inv.summary.waitingHours} hours waiting for the Iris Supervisor to approve.`}
                        {inv.summary.undocumented > 0 && ` ${inv.summary.undocumented} program${inv.summary.undocumented === 1 ? "" : "s"} not documented.`}
                      </p>
                    )}
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-border">
                          {inv.lines.map((l, n) => (
                            <tr key={n}>
                              <td className={cell}>{l.description}</td>
                              <td className={`${cell} text-right text-muted`}>{l.quantity != null ? `${l.quantity} ${l.unit ?? ""} × ${money(Number(l.unit_amount ?? 0))}` : ""}</td>
                              <td className={`${cell} text-right`}>{money(l.amount)}</td>
                            </tr>
                          ))}
                          {inv.lines.length === 0 && (
                            <tr><td className={`${cell} text-muted`} colSpan={3}>Nothing to bill.</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-brand-purple font-semibold">
                            <td className={cell} colSpan={2}>Total</td>
                            <td className={`${cell} text-right`}>{money(inv.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <a href={`/residencies/${id}/billing/pdf?${q}&view=1`} target="_blank" rel="noreferrer" className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">View PDF</a>
                      <a href={`/residencies/${id}/billing/pdf?${q}`} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">Download PDF</a>
                      <InvoiceActions residencyId={id} agreementId={a.id} month={month} kind={inv.kind} siteId={inv.siteId} invoiceId={inv.id} state={inv.state} total={money(inv.total)} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <details className="mt-4 border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-medium text-iris">Edit contract</summary>
              <div className="mt-4 flex flex-col gap-6">
                <AgreementForm key={JSON.stringify(a)} residencyId={id} seasonId={season.id} sites={sites} agreement={a} siteIds={a.partner_agreement_site.map((s) => s.site_id)} />
                {a.billing_basis === "installments" && (
                  <div>
                    <h3 className="text-sm font-medium">Installments</h3>
                    <div className="mt-2"><InstallmentEditor residencyId={id} agreementId={a.id} installments={a.partner_installment} /></div>
                  </div>
                )}
              </div>
            </details>
          </section>
        ))}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Custom invoices this month</h2>
          <form action={async () => { "use server"; await createCustomInvoice(id); }}>
            <button className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">New custom invoice</button>
          </form>
        </div>
        <p className="mt-1 text-sm text-muted">Typed by hand, for work outside a contract (e.g. an extra concert).</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {(customRows ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/admin/invoices/${c.id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:text-iris">
                <span><span className="font-medium">{c.title}</span> · {c.number} · {c.invoice_date}</span>
                <span>{money(Number(c.total))} · {c.state === "paid" ? "Paid" : c.state === "sent" ? "Sent" : "Draft"}</span>
              </Link>
            </li>
          ))}
          {(customRows ?? []).length === 0 && <li className="py-2 text-muted">None this month.</li>}
        </ul>
      </section>

      {season && (
        <section className={card}>
          <details open={agreements.length === 0}>
            <summary className="cursor-pointer text-sm font-medium text-iris">Add a contract for {season.name}</summary>
            <div className="mt-4"><AgreementForm residencyId={id} seasonId={season.id} sites={sites} /></div>
          </details>
        </section>
      )}
    </AppShell>
  );
}
