"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { customLinesTotal, type CustomLine } from "@/shared/domain/partner-invoice";
import { deleteCustomInvoice, saveCustomInvoice, setCustomInvoiceState } from "./actions";

const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";
type Row = { description: string; quantity: string; rate: string; amount: string };
const toRow = (l: CustomLine): Row => ({
  description: l.description,
  quantity: l.quantity != null ? String(l.quantity) : "",
  rate: l.unit_amount != null ? String(l.unit_amount) : "",
  amount: l.quantity == null ? String(l.amount) : "",
});
const n = (v: string) => (v.trim() === "" ? null : Number(v));
const toLine = (r: Row): CustomLine => {
  const q = n(r.quantity);
  const rate = n(r.rate);
  return { description: r.description, quantity: q, unit_amount: rate, amount: q != null && rate != null ? Math.round(q * rate * 100) / 100 : Number(n(r.amount) ?? 0) };
};

export function CustomInvoiceForm({
  id,
  title,
  invoiceDate,
  residencyId,
  billTo,
  lines,
  programs,
  state,
}: {
  id: string;
  title: string;
  invoiceDate: string;
  residencyId: string | null;
  billTo: string;
  lines: CustomLine[];
  programs: { id: string; name: string }[];
  state: "draft" | "sent" | "paid";
}) {
  const [t, setT] = useState(title);
  const [date, setDate] = useState(invoiceDate);
  const [rid, setRid] = useState(residencyId ?? "");
  const [to, setTo] = useState(billTo);
  const [rows, setRows] = useState<Row[]>(lines.length ? lines.map(toRow) : [{ description: "", quantity: "", rate: "", amount: "" }]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const locked = state !== "draft";
  const total = customLinesTotal(rows.map(toLine));
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = (then?: () => Promise<unknown>) =>
    start(async () => {
      const r = await saveCustomInvoice(id, { title: t, invoiceDate: date, residencyId: rid || null, billTo: to, lines: rows.map(toLine) });
      if (r.status === "error") return setMsg(r.message ?? "Something went wrong.");
      if (then) {
        const r2 = (await then()) as { status: string; message?: string };
        if (r2?.status === "error") return setMsg(r2.message ?? "Something went wrong.");
      }
      setMsg("Saved.");
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="e.g. Holiday concert, Corporate overhead">
          <input value={t} onChange={(e) => setT(e.target.value)} disabled={locked} className={inputClass} />
        </Field>
        <Field label="Invoice date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={locked} className={inputClass} />
        </Field>
        <Field label="Bill to" hint="Name, address and email, one per line">
          <textarea rows={4} value={to} onChange={(e) => setTo(e.target.value)} disabled={locked} className={inputClass} />
        </Field>
        <Field label="Program (optional)" hint="Shows this invoice on that program's Community invoices">
          <select value={rid} onChange={(e) => setRid(e.target.value)} disabled={locked} className={inputClass}>
            <option value="">Not linked to a program</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Lines</legend>
        <p className="text-xs text-muted">Enter hours (or a quantity) and a rate, or just an amount.</p>
        {rows.map((r, i) => {
          const line = toLine(r);
          return (
            <div key={i} className="grid grid-cols-[1fr_5rem_6rem_6rem_auto] items-center gap-2">
              <input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} disabled={locked} placeholder="Description" aria-label={`Line ${i + 1} description`} className={`${inputClass} py-1.5 text-sm`} />
              <input inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} disabled={locked} placeholder="Qty" aria-label={`Line ${i + 1} quantity`} className={`${inputClass} py-1.5 text-sm`} />
              <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} disabled={locked} placeholder="Rate $" aria-label={`Line ${i + 1} rate`} className={`${inputClass} py-1.5 text-sm`} />
              {line.quantity != null && line.unit_amount != null ? (
                <span className="text-right text-sm">${line.amount.toFixed(2)}</span>
              ) : (
                <input inputMode="decimal" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} disabled={locked} placeholder="Amount $" aria-label={`Line ${i + 1} amount`} className={`${inputClass} py-1.5 text-sm`} />
              )}
              {!locked ? (
                <button type="button" className="text-xs text-muted underline" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
              ) : <span />}
            </div>
          );
        })}
        {!locked && (
          <button type="button" className={`${small} self-start`} onClick={() => setRows((rs) => [...rs, { description: "", quantity: "", rate: "", amount: "" }])}>
            Add a line
          </button>
        )}
        <p className="mt-2 text-right font-semibold">Total ${total.toFixed(2)}</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {state === "draft" && (
          <>
            <button type="button" disabled={pending} className={buttonClass} onClick={() => save()}>{pending ? "Saving..." : "Save draft"}</button>
            <ConfirmButton
              disabled={pending}
              className={small}
              label="Mark as sent"
              question={`Save and freeze this $${total.toFixed(2)} invoice as sent?`}
              confirmLabel="Yes, sent"
              onConfirm={() => save(() => setCustomInvoiceState(id, "sent"))}
            />
            <ConfirmButton disabled={pending} className="text-xs text-muted underline" label="Delete draft" question="Delete this draft invoice?" confirmLabel="Yes, delete" onConfirm={() => start(() => deleteCustomInvoice(id))} />
          </>
        )}
        {state === "sent" && <button type="button" disabled={pending} className={small} onClick={() => start(async () => { await setCustomInvoiceState(id, "paid"); })}>Mark as paid</button>}
        {state === "paid" && <button type="button" disabled={pending} className="text-xs text-muted underline" onClick={() => start(async () => { await setCustomInvoiceState(id, "sent"); })}>Undo paid</button>}
        {msg && <span role="status" className="text-sm text-iris">{msg}</span>}
      </div>
    </div>
  );
}
