"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { confirmMonth, sendMonth, undoConfirmMonth, type CycleResult } from "../../month-cycle-actions";

// A building's month on its way to the partner (DOMAIN-MODEL ScheduleMonth,
// v0.41): the stage, what it means, and the next step for whoever can take it.

export type Stage = "team_editing" | "team_confirmed" | "sent_to_partner" | "partner_changes" | "final";
const STAGES: Stage[] = ["team_editing", "team_confirmed", "sent_to_partner", "partner_changes", "final"];
const LABEL: Record<Stage, string> = { team_editing: "Team editing", team_confirmed: "Team confirmed", sent_to_partner: "Sent to partner", partner_changes: "Partner changes", final: "Final" };
const HELP: Record<Stage, string> = {
  team_editing: "Open for the team: each date's leader adds its title; musicians mark dates they can't play and propose leader swaps (under More).",
  team_confirmed: "The Iris Supervisor confirmed the team's version. Dates are locked for musicians; ask the Iris Supervisor for changes.",
  sent_to_partner: "The draft calendar went to the partner. The Lead Musician enters any partner changes on the dates below.",
  partner_changes: "The Lead Musician is entering the partner's changes, then marks the month final.",
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
  const i = stage ? STAGES.indexOf(stage) : -1;
  const name = monthLabel.split(" ")[0];
  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }) : "");
  const sender = canSchedule || isAdminLead;

  return (
    <section className="mt-5 rounded-xl border border-border bg-surface p-4 sm:p-5" aria-label={`${monthLabel} at ${siteName}`}>
      <div className="flex gap-1" aria-hidden="true">
        {STAGES.map((s, k) => <span key={s} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-iris" : "bg-border"}`} />)}
      </div>
      <p className="mt-2 font-semibold">{stage ? `${name} at ${siteName}: stage ${i + 1} of 5, ${LABEL[stage]}` : `${name} at ${siteName} has no dates yet`}</p>
      <p className="mt-1 text-sm text-muted">
        {stage ? HELP[stage] : "It opens for the team by itself as soon as its first date is added."}
        {stage && (stage === "team_editing" || stage === "team_confirmed") && dueTeam ? ` Team version due ${fmt(dueTeam)}.` : ""}
        {stage && (stage === "sent_to_partner" || stage === "partner_changes") && dueFinal ? ` Final due ${fmt(dueFinal)}.` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stage === "team_editing" && canSchedule && (
          <ConfirmButton disabled={pending} className={small} label={`Confirm the team's ${name}`} question="Confirming locks the dates for musicians; the Lead Musician then sends it to the partner." confirmLabel="Confirm" onConfirm={() => run(() => confirmMonth(residencyId, siteId, month))} />
        )}
        {stage === "team_confirmed" && canSchedule && (
          <button type="button" disabled={pending} className={small} onClick={() => run(() => undoConfirmMonth(residencyId, siteId, month))}>Undo confirm</button>
        )}
        {(stage === "team_editing" || stage === "team_confirmed") && sender && (
          <ConfirmButton disabled={pending} className={buttonClass} label="Send calendar to partner" question="Email the draft calendar to the building's calendar contacts now, copying the Iris Supervisor and Lead Musician? If the Iris Supervisor hasn't confirmed, sending confirms it." confirmLabel="Send" onConfirm={() => run(() => sendMonth("send", residencyId, siteId, month))} />
        )}
        {(stage === "sent_to_partner" || stage === "partner_changes") && sender && (
          <ConfirmButton disabled={pending} className={buttonClass} label="Mark final and send" question={`Send the final ${monthLabel} calendar and lock the month?`} confirmLabel="Mark final and send" onConfirm={() => run(() => sendMonth("finalize", residencyId, siteId, month))} />
        )}
        {stage && i >= 2 && sender && (
          <button type="button" disabled={pending} className={small} onClick={() => run(() => sendMonth("resend", residencyId, siteId, month))}>Email it again</button>
        )}
      </div>
      {message && <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${message.ok ? "bg-iris-soft" : "bg-brand-orange/10 text-brand-orange"}`}>{message.message}</p>}
    </section>
  );
}
