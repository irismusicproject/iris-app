"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass } from "@/components/auth-card";
import { markMonthReviewed, newCalendarVersion, publishMonth, type ScheduleResult } from "../../schedule-actions";

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
          {isPointPerson && (
            <button
              type="button"
              disabled={pending}
              className={`${buttonClass} mt-4`}
              onClick={() => {
                if (confirm(`Mark ${siteName}'s ${monthLabel} schedule as reviewed?`)) run(() => markMonthReviewed(residencyId, siteId, month));
              }}
            >
              {pending ? "Saving..." : `Mark ${monthLabel} reviewed`}
            </button>
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
            <button
              type="button"
              disabled={pending}
              className={`${buttonClass} mt-4`}
              onClick={() => {
                if (confirm(`Publish ${monthLabel} at ${siteName}? Musicians will treat it as final.`))
                  run(() => publishMonth(residencyId, siteId, month), download);
              }}
            >
              {pending ? "Publishing..." : "Publish and download"}
            </button>
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
