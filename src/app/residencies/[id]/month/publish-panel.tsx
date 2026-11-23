"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { markMonthReviewed, markScheduleChecked, newCalendarVersion, publishMonth, undoScheduleChecked, type ScheduleResult } from "../../schedule-actions";

/** One musician playing at this building this month, and whether they're done reviewing (v0.35). */
export type ScheduleCheckRow = { personId: string; name: string; done: boolean; changedSince: boolean };

// Steps 3–5 of publishing a month (DOMAIN-MODEL section 3):
// point person marks it reviewed → admin lead clicks "Publish and download"
// → after partner feedback, "Download updated calendar".
export function PublishPanel({
  residencyId,
  siteId,
  siteName,
  month,
  monthLabel,
  latest,
  isPointPerson,
  canSchedule,
  draftCount,
  needLeader,
  checks,
  myId,
}: {
  residencyId: string;
  siteId: string;
  siteName: string;
  month: string;
  monthLabel: string;
  latest: { version: number; state: "reviewed" | "sent" } | null;
  isPointPerson: boolean;
  canSchedule: boolean;
  draftCount: number;
  needLeader: number;
  checks: ScheduleCheckRow[];
  myId: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const pdfUrl = `/residencies/${residencyId}/month/${month}/calendar?site=${siteId}`;

  const run = (fn: () => Promise<ScheduleResult>, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.status === "error") setMessage(r.message ?? "Something went wrong.");
      else {
        setMessage(null);
        then?.();
      }
    });
  const mine = checks.find((c) => c.personId === myId);
  const waiting = checks.filter((c) => !c.done);
  const doneList = checks.filter((c) => c.done);
  const listNames = (rows: ScheduleCheckRow[]) => rows.map((c) => c.name).join(", ");
  const download = () => {
    window.location.href = pdfUrl;
  };

  return (
    <section className="mt-6 rounded-xl border border-iris/30 bg-iris-soft p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Partner calendar</h2>

      {!latest && (
        <>
          <p className="mt-1 text-sm text-muted">
            Next: the point person reviews {monthLabel} with the admin lead, then marks it reviewed.
            {needLeader > 0 && ` ${needLeader} program${needLeader === 1 ? " still needs" : "s still need"} a leader.`}
          </p>

          {checks.length > 0 && (
            <div className="mt-4 rounded-lg border border-iris/20 bg-surface p-4">
              <h3 className="text-sm font-semibold">Musicians reviewing their dates</h3>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {checks.map((c) => (
                  <li
                    key={c.personId}
                    className={`rounded-full border px-3 py-1 ${c.done ? (c.changedSince ? "border-brand-orange" : "border-iris bg-iris-soft") : "border-border text-muted"}`}
                  >
                    {c.name}: {c.done ? (c.changedSince ? "done, changed since" : "done") : "not yet"}
                  </li>
                ))}
              </ul>
              {mine && (
                <div className="mt-3 border-t border-border pt-3">
                  {mine.done ? (
                    <p className="text-sm">
                      {mine.changedSince
                        ? "You marked your dates done, then changed one. Mark done again so the point person knows."
                        : `You're done reviewing your ${monthLabel} dates here. You can still change them until the point person marks the month reviewed.`}{" "}
                      {mine.changedSince ? (
                        <button type="button" disabled={pending} onClick={() => run(() => markScheduleChecked(residencyId, siteId, month))} className={`${buttonClass} mt-2 block`}>
                          {pending ? "Saving..." : "Done reviewing again"}
                        </button>
                      ) : (
                        <button type="button" disabled={pending} onClick={() => run(() => undoScheduleChecked(residencyId, siteId, month))} className="text-iris underline-offset-2 hover:underline">
                          Undo
                        </button>
                      )}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted">
                        Look over the dates you play at {siteName} below (titles, rooms, who plays, notes). When they&apos;re right, let the point person know.
                      </p>
                      <button type="button" disabled={pending} onClick={() => run(() => markScheduleChecked(residencyId, siteId, month))} className={`${buttonClass} mt-2`}>
                        {pending ? "Saving..." : "Done reviewing my dates"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {isPointPerson && (
            <div className="mt-4">
              <ConfirmButton
                disabled={pending}
                className={buttonClass}
                label={pending ? "Saving..." : `Mark ${monthLabel} reviewed`}
                question={
                  waiting.length
                    ? `Not done reviewing yet: ${listNames(waiting)}. Mark ${siteName}'s ${monthLabel} schedule reviewed anyway? Their dates lock.`
                    : `Mark ${siteName}'s ${monthLabel} schedule as reviewed?${doneList.length ? " Every musician is done reviewing." : ""}`
                }
                confirmLabel="Yes, reviewed"
                onConfirm={() => run(() => markMonthReviewed(residencyId, siteId, month))}
              />
            </div>
          )}
        </>
      )}

      {latest?.state === "reviewed" && (
        <>
          <p className="mt-1 text-sm text-muted">
            Reviewed. Publishing locks the {draftCount} draft program{draftCount === 1 ? "" : "s"} for musicians and downloads the
            calendar to email to the partner (cc the point person).
          </p>
          {canSchedule && (
            <div className="mt-4">
              <ConfirmButton
                disabled={pending}
                className={buttonClass}
                label={pending ? "Publishing..." : "Publish and download"}
                question={`Publish ${monthLabel} at ${siteName}? Musicians will treat it as final.`}
                confirmLabel="Yes, publish"
                onConfirm={() => run(() => publishMonth(residencyId, siteId, month), download)}
              />
            </div>
          )}
        </>
      )}

      {latest?.state === "sent" && (
        <>
          <p className="mt-1 text-sm text-muted">
            Published. Version {latest.version} was downloaded to send to the partner.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={pdfUrl} className={`${buttonClass} inline-block`}>Download calendar</a>
            <a href={`${pdfUrl}&view=1`} target="_blank" rel="noreferrer" className="text-sm text-iris underline-offset-2 hover:underline">View in browser</a>
          </div>
          {canSchedule && (
            <div className="mt-5 border-t border-iris/20 pt-4">
              <h3 className="text-sm font-semibold">Partner feedback?</h3>
              <p className="text-xs text-muted">
                Make the changes above, then download an updated version (version {latest.version + 1}). New drafts are published with it.
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                placeholder="What the partner asked for (internal, never printed)"
                className={`${inputClass} mt-2 w-full`}
              />
              <button
                type="button"
                disabled={pending}
                className="mt-2 rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-iris-soft"
                onClick={() => run(() => newCalendarVersion(residencyId, siteId, month, feedback), () => { setFeedback(""); download(); })}
              >
                {pending ? "Saving..." : "Download updated calendar"}
              </button>
            </div>
          )}
        </>
      )}

      {message && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{message}</p>}
    </section>
  );
}
