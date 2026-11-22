"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { OVERHEAD_BILLING_LABELS, type Agreement } from "@/shared/domain/partner-invoice";
import { addPartnerInstallment, markInvoiceSent, removePartnerInstallment, saveAgreement, setInvoicePaid, setMonthChoices, type BillingResult } from "./actions";

const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function AgreementForm({
  residencyId,
  seasonId,
  sites,
  agreement,
  siteIds = [],
}: {
  residencyId: string;
  seasonId: string;
  sites: { id: string; name: string }[];
  agreement?: Agreement;
  siteIds?: string[];
}) {
  const [name, setName] = useState(agreement?.name ?? "Programming");
  const [basis, setBasis] = useState(agreement?.billing_basis ?? "per_hour");
  const [rate, setRate] = useState(agreement?.hourly_rate != null ? String(Number(agreement.hourly_rate)) : "");
  const [contracted, setContracted] = useState(agreement?.contracted_hours != null ? String(Number(agreement.contracted_hours)) : "");
  const [stipends, setStipends] = useState(agreement?.bill_stipends ?? false);
  const [overheadOn, setOverheadOn] = useState(agreement ? !!agreement.overhead_percent : false);
  const [overhead, setOverhead] = useState(agreement?.overhead_percent ? String(Number(agreement.overhead_percent)) : "15");
  const [overheadBilling, setOverheadBilling] = useState(agreement?.overhead_billing ?? "same_invoice");
  const [late, setLate] = useState(agreement?.bill_late_cancellations ?? true);
  const [picked, setPicked] = useState<string[]>(siteIds.length ? siteIds : sites.length === 1 ? [sites[0]!.id] : []);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAgreement(residencyId, seasonId, agreement?.id ?? null, {
            name,
            billingBasis: basis,
            hourlyRate: num(rate),
            contractedHours: num(contracted),
            billStipends: stipends,
            overheadPercent: overheadOn ? num(overhead) : null,
            overheadBilling,
            billLateCancellations: late,
            siteIds: picked,
          });
          setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Saved.");
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contract name" hint="Internal, e.g. which service it covers">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </Field>
        <Field label="Billed">
          <select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} className={inputClass}>
            <option value="per_hour">Per hour</option>
            <option value="installments">In installments (e.g. quarterly)</option>
          </select>
        </Field>
        {basis === "per_hour" && (
          <Field label="Hourly rate ($)">
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required className={inputClass} />
          </Field>
        )}
        <Field label="Contracted hours this season (optional)" hint="Shown on every invoice as progress">
          <input inputMode="decimal" value={contracted} onChange={(e) => setContracted(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={overheadOn} onChange={(e) => setOverheadOn(e.target.checked)} /> Charge overhead
          </label>
          {overheadOn && (
            <label className="flex items-center gap-2">
              <input inputMode="decimal" value={overhead} onChange={(e) => setOverhead(e.target.value)} aria-label="Overhead percent" className={`${inputClass} w-20 py-1.5`} />
              % of billable hours (or installments) plus billed stipends
            </label>
          )}
        </div>
        {overheadOn ? (
          <Field label="Overhead goes">
            <select value={overheadBilling} onChange={(e) => setOverheadBilling(e.target.value as typeof overheadBilling)} className={inputClass}>
              {(["same_invoice", "separate_invoice"] as const).map((k) => <option key={k} value={k}>{OVERHEAD_BILLING_LABELS[k]}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Sites this contract covers</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))} /> {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={stipends} onChange={(e) => setStipends(e.target.checked)} /> Also bill musicians&apos; stipend payments due that month
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> Bill programs the community canceled after 9 am that day
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={`${buttonClass} self-start`}>{pending ? "Saving..." : agreement ? "Save contract" : "Add contract"}</button>
        {msg && <span role="status" className="text-sm text-iris">{msg}</span>}
      </div>
    </form>
  );
}

export function InstallmentEditor({ residencyId, agreementId, installments }: { residencyId: string; agreementId: string; installments: { id: string; due_on: string; amount: number }[] }) {
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<BillingResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.status === "error" ? r.message ?? "Something went wrong." : null);
      if (r.status !== "error") after?.();
    });
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul className="space-y-1">
        {[...installments].sort((a, b) => a.due_on.localeCompare(b.due_on)).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2">
            Due {i.due_on} · ${Number(i.amount).toFixed(2)}
            <ConfirmButton label="Remove" question="Remove this installment?" className="text-xs text-muted underline" onConfirm={() => run(() => removePartnerInstallment(residencyId, i.id))} />
          </li>
        ))}
        {installments.length === 0 && <li className="text-muted">No installments yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addPartnerInstallment(residencyId, agreementId, due, Number(amount)), () => { setDue(""); setAmount(""); });
        }}
      >
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Installment due on" className={`${inputClass} py-1 text-xs`} />
        <span>$</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Installment amount" className={`${inputClass} w-28 py-1 text-xs`} />
        <button disabled={pending} className={small}>Add installment</button>
      </form>
      {msg && <p role="status" className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}

export function InvoiceActions({
  residencyId,
  agreementId,
  month,
  kind,
  siteId,
  invoiceId,
  state,
  total,
}: {
  residencyId: string;
  agreementId: string;
  month: string;
  kind: string;
  siteId: string | null;
  invoiceId: string | null;
  state: "draft" | "sent" | "paid";
  total: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<BillingResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.status === "error" ? r.message ?? "Something went wrong." : null);
    });
  return (
    <span className="flex flex-wrap items-center gap-2">
      {state === "draft" && (
        <ConfirmButton
          disabled={pending}
          className={small}
          label="Mark as sent"
          question={`Freeze this ${total} invoice as sent? It won't change after this.`}
          confirmLabel="Yes, sent"
          onConfirm={() => run(() => markInvoiceSent(residencyId, agreementId, month, kind, siteId))}
        />
      )}
      {state === "sent" && invoiceId && <button type="button" disabled={pending} className={small} onClick={() => run(() => setInvoicePaid(residencyId, invoiceId, true))}>Mark as paid</button>}
      {state === "paid" && invoiceId && <button type="button" disabled={pending} className="text-xs text-muted underline" onClick={() => run(() => setInvoicePaid(residencyId, invoiceId, false))}>Undo paid</button>}
      {msg && <span role="status" className="text-xs text-red-600">{msg}</span>}
    </span>
  );
}

/** Stipend checkboxes for one contract and month (v0.23). */
export function MonthChoices({
  residencyId,
  agreementId,
  month,
  stipends,
  locked,
}: {
  residencyId: string;
  agreementId: string;
  month: string;
  stipends: { id: string; label: string; amount: number; included: boolean }[];
  locked: boolean;
}) {
  const [left, setLeft] = useState<string[]>(stipends.filter((s) => !s.included).map((s) => s.id));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const save = (next: string[]) => {
    setLeft(next);
    start(async () => {
      const r = await setMonthChoices(residencyId, agreementId, month, next);
      setMsg(r.status === "error" ? r.message ?? "Something went wrong." : null);
    });
  };
  if (stipends.length === 0) return null;
  return (
    <div className="rounded-lg bg-iris-soft/60 p-3 text-sm">
      <p className="font-medium">Stipends this month{locked ? " (sent, can't change)" : ""}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {stipends.map((s) => (
          <label key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!left.includes(s.id)}
              disabled={locked || pending}
              onChange={(e) => save(e.target.checked ? left.filter((x) => x !== s.id) : [...left, s.id])}
            />
            Bill {s.label} · ${s.amount.toFixed(2)}
          </label>
        ))}
      </div>
      {msg && <p role="status" className="mt-1 text-xs text-red-600">{msg}</p>}
    </div>
  );
}
