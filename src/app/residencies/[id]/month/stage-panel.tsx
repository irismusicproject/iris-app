"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { sendMonth, type CycleResult } from "../../month-cycle-actions";

// A building's month on its way to the partner (DOMAIN-MODEL ScheduleMonth,
// v0.41, three steps since v0.51): the stage, what it means, and the next step for whoever can take it.

export type Stage = "team_editing" | "team_confirmed" | "sent_to_partner" | "partner_changes" | "final";
// D20 (Nov 27, 2026): three steps on screen. team_confirmed (no longer set)
// reads as team editing; partner_changes (a change made after sending) reads
// as sent to partner.
type Step = "team_editing" | "sent_to_partner" | "final";
const STEPS: Step[] = ["team_editing", "sent_to_partner", "final"];
const stepOf = (s: Stage): Step => (s === "team_confirmed" ? "team_editing" : s === "partner_changes" ? "sent_to_partner" : s);
const LABEL: Record<Step, string> = { team_editing: "Team editing", sent_to_partner: "Sent to partner", final: "Final" };
const HELP: Record<Step, string> = {
  team_editing: "Open for the team: musicians review and edit their dates until the 10th; each date's leader adds its title (type “No Program” to cancel a date). The Lead Musician then sends it to the partner.",
  sent_to_partner: "The calendar went to the partner. Only the partner's changes go in now, entered by the Lead Musician; anything else, ask the Iris Supervisor. The Lead Musician marks it final by the 15th.",
  final: "Final and locked. Changes, subs included, go through the Iris Supervisor.",
};
const small = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft disabled:opacity-60";

export function StagePanel({
  residencyId,
  siteId,
  siteName,
  month,
  monthLabel,
  stage,
  dueTeam,
  dueFinal,
  canSchedule,
  isAdminLead,
}: {
  residencyId: string;
  siteId: string;
  siteName: string;
  month: string;
  monthLabel: string;
  stage: Stage | null;
  dueTeam: string | null;
  dueFinal: string | null;
  canSchedule: boolean;
  isAdminLead: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<CycleResult | null>(null);
  const run = (fn: () => Promise<CycleResult>) => start(async () => setMessage(await fn()));
  const step = stage ? stepOf(stage) : null;
  const i = step ? STEPS.indexOf(step) : -1;
  const name = monthLabel.split(" ")[0];
  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }) : "");
  const sender = canSchedule || isAdminLead;

  return (
    <section className="mt-5 rounded-xl border border-border bg-surface p-4 sm:p-5" aria-label={`${monthLabel} at ${siteName}`}>
      <div className="flex gap-1" aria-hidden="true">
        {STEPS.map((s, k) => <span key={s} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-iris" : "bg-border"}`} />)}
      </div>
      <p className="mt-2 font-semibold">{step ? `${name} at ${siteName}: stage ${i + 1} of 3, ${LABEL[step]}` : `${name} at ${siteName} has no dates yet`}</p>
      <p className="mt-1 text-sm text-muted">
        {step ? HELP[step] : "It opens for the team by itself as soon as its first date is added."}
        {step === "team_editing" && dueTeam ? ` The Lead Musician sends it ${fmt(dueTeam)}.` : ""}
        {step === "sent_to_partner" && dueFinal ? ` Final due ${fmt(dueFinal)}.` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {step === "team_editing" && sender && (
          <ConfirmButton disabled={pending} className={buttonClass} label="Send calendar to partner" question="Email the draft calendar to the building's calendar contacts now, copying the Iris Supervisor and Lead Musician? After that, only partner changes go in." confirmLabel="Send" onConfirm={() => run(() => sendMonth("send", residencyId, siteId, month))} />
        )}
        {step === "sent_to_partner" && sender && (
          <ConfirmButton disabled={pending} className={buttonClass} label="Mark final and send" question={`Send the final ${monthLabel} calendar and lock the month?`} confirmLabel="Mark final and send" onConfirm={() => run(() => sendMonth("finalize", residencyId, siteId, month))} />
        )}
        {step && i >= 1 && sender && (
          <button type="button" disabled={pending} className={small} onClick={() => run(() => sendMonth("resend", residencyId, siteId, month))}>Email it again</button>
        )}
      </div>
      {message && <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${message.ok ? "bg-iris-soft" : "bg-brand-orange/10 text-brand-orange"}`}>{message.message}</p>}
    </section>
  );
}
