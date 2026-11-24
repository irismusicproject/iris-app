"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { decideRequest, openMonth, sendMonth, type CycleResult } from "@/app/residencies/month-cycle-actions";

// To do (DOMAIN-MODEL v0.41): the same list as the phone app's first tab,
// worked out by the database (my_tasks). Each task has a deadline and an
// email reminder; one click opens or does it.

export type Task = {
  kind: "open_month" | "titles" | "confirm" | "cover" | "approve" | "send" | "partner_changes" | "finalize" | "document" | "submit_week";
  title: string;
  detail: string | null;
  due_on: string;
  residency_id: string | null;
  site_id: string | null;
  month: string | null;
  session_id: string | null;
  request_id: string | null;
};

const REMINDER: Record<Task["kind"], string> = {
  open_month: "No reminder: open it on the 1st",
  titles: "Email reminder the day before it's due",
  confirm: "Email reminder the day before it's due",
  cover: "Emailed when they marked it",
  approve: "Emailed when they asked",
  send: "Email reminder the morning it's due",
  partner_changes: "No reminder (only if the partner asks for changes)",
  finalize: "Email reminder the day before it's due",
  document: "Email reminder Monday at noon",
  submit_week: "Email reminder Monday at noon",
};

const due = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const small = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft disabled:opacity-60";

export function TodoList({ tasks, today }: { tasks: Task[]; today: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<CycleResult | null>(null);
  const run = (fn: () => Promise<CycleResult>) => start(async () => setMessage(await fn()));
  const monthHref = (t: Task) => `/residencies/${t.residency_id}/month/${t.month!.slice(0, 7)}${t.site_id ? `?site=${t.site_id}` : ""}`;

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="todo-heading">
      <h2 id="todo-heading" className="text-lg font-semibold">To do</h2>
      <p className="mt-1 text-sm text-muted">{tasks.length ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"}, soonest first. Each has an email reminder.` : "Nothing to do right now. New tasks appear here with their deadline."}</p>
      {message && <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${message.ok ? "bg-iris-soft" : "bg-brand-orange/10 text-brand-orange"}`}>{message.message}</p>}
      <ul className="mt-3 divide-y divide-border">
        {tasks.map((t, i) => (
          <li key={`${t.kind}-${t.session_id ?? t.request_id ?? t.site_id ?? ""}-${i}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{t.title}</p>
              {t.detail && <p className="text-sm text-muted">{t.detail}</p>}
              <p className="text-xs text-muted">
                <span className={t.due_on < today ? "font-semibold text-brand-orange" : "font-semibold"}>{t.due_on < today ? "Was due" : "Due"} {due(t.due_on)}</span> · ✉ {REMINDER[t.kind]}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {t.kind === "approve" && (
                <>
                  <button type="button" disabled={pending} className={buttonClass} onClick={() => run(() => decideRequest(t.request_id!, true))}>Approve</button>
                  <ConfirmButton disabled={pending} className={small} label="Decline" question="Decline this request? They'll get an email." confirmLabel="Decline" onConfirm={() => run(() => decideRequest(t.request_id!, false))} />
                </>
              )}
              {t.kind === "open_month" && (
                <ConfirmButton disabled={pending} className={small} label="Open it for the team" question={`${t.title}? The musicians playing get an email.`} confirmLabel="Open it" onConfirm={() => run(() => openMonth(t.residency_id!, t.month!.slice(0, 7)))} />
              )}
              {(t.kind === "send" || t.kind === "finalize") && (
                <>
                  <a className={small} href={`/residencies/${t.residency_id}/month/${t.month!.slice(0, 7)}/calendar?site=${t.site_id}&view=1`} target="_blank" rel="noreferrer">See the PDF</a>
                  <ConfirmButton
                    disabled={pending}
                    className={small}
                    label={t.kind === "send" ? "Send calendar to partner" : "Mark final and send"}
                    question={t.kind === "send" ? "Email the draft calendar to the partner now? If the point person hasn't confirmed, sending confirms it." : "Send the final calendar and lock the month?"}
                    confirmLabel={t.kind === "send" ? "Send" : "Mark final and send"}
                    onConfirm={() => run(() => sendMonth(t.kind === "send" ? "send" : "finalize", t.residency_id!, t.site_id!, t.month!.slice(0, 7)))}
                  />
                </>
              )}
              {(t.kind === "titles" || t.kind === "confirm" || t.kind === "partner_changes") && (
                <Link className={small} href={monthHref(t)}>{t.kind === "confirm" ? "Review and confirm" : t.kind === "titles" ? "Add titles" : "Open the month"}</Link>
              )}
              {t.kind === "cover" && t.residency_id && t.month && <Link className={small} href={monthHref(t)}>Open the month</Link>}
              {(t.kind === "document" || t.kind === "submit_week") && <Link className={small} href="/documentation">Open my week</Link>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
