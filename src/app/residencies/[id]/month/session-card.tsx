"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import {
  CANCELLATION_REASON_LABELS,
  CANCELLATION_REASONS,
  CANCELED_FOR_ABSENCE_CALENDAR_TEXT,
  type CancellationReason,
} from "@/shared/domain/scheduling";
import {
  addMusician,
  cancelSession,
  removeMusician,
  setLeader,
  setSessionRoom,
  setSessionTitle,
  setSessionWhen,
  type ScheduleResult,
} from "../../schedule-actions";

export type CardSession = {
  id: string;
  title: string;
  kind: "group_session" | "relationship_building";
  dayLabel: string;
  timeLabel: string | null;
  localDate: string;
  localTime: string;
  locationId: string;
  roomLabel: string;
  isSpecialEvent: boolean;
  state: "draft" | "published" | "canceled";
  cancellationReason: CancellationReason | null;
  publicNote: string | null;
  assignments: { id: string; personId: string; name: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
};

type Option = { id: string; label: string };
const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";

export function SessionCard({
  residencyId,
  timeZone,
  session,
  rooms,
  roster,
  onRoster,
  canSchedule,
}: {
  residencyId: string;
  timeZone: string;
  session: CardSession;
  rooms: Option[];
  roster: Option[];
  onRoster: boolean;
  canSchedule: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState(session.title);
  const [reason, setReason] = useState<CancellationReason>("other");
  const isDraft = session.state === "draft";
  const canceled = session.state === "canceled";
  const canEdit = isDraft && (onRoster || canSchedule);
  const playing = session.assignments.filter((a) => a.status !== "absent");
  const leader = playing.find((a) => a.role === "leader");
  const notOnIt = roster.filter((r) => !session.assignments.some((a) => a.personId === r.id));

  const run = (fn: () => Promise<ScheduleResult>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.status === "error" ? r.message ?? "Something went wrong." : done ?? null);
    });

  return (
    <li className="py-3" data-session={session.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">
          {session.dayLabel}
          {session.timeLabel && <span className="text-muted"> · {session.timeLabel}</span>}
        </span>
        <span className="text-xs text-muted">
          {canceled ? "Canceled" : isDraft ? "Draft" : "Published"} · {session.roomLabel}
        </span>
      </div>

      {canceled ? (
        <p className="mt-1">
          {CANCELED_FOR_ABSENCE_CALENDAR_TEXT}
          {session.cancellationReason && (
            <span className="text-xs text-muted"> ({CANCELLATION_REASON_LABELS[session.cancellationReason]}, internal)</span>
          )}
        </p>
      ) : canEdit ? (
        <form
          className="mt-1 flex flex-wrap gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            run(() => setSessionTitle(residencyId, session.id, title), "Title saved.");
          }}
        >
          <input
            aria-label={`Title for ${session.dayLabel}`}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            className={`${inputClass} min-w-0 flex-1 py-1.5`}
          />
          {title !== session.title && <button disabled={pending} className={small}>Save title</button>}
        </form>
      ) : (
        <p className="mt-1">{session.title}</p>
      )}

      {!canceled && (
        <>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {session.assignments.map((a) => (
              <li
                key={a.id}
                className={`flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 ${a.status === "absent" ? "text-muted line-through" : ""}`}
              >
                {a.name}
                {a.role === "leader" && a.status !== "absent" && <span className="text-xs text-iris">(leader)</span>}
                {a.status === "substitute" && <span className="text-xs text-muted">(sub)</span>}
                {canEdit && a.status !== "absent" && (a.role !== "leader" || canSchedule) && (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remove ${a.name} from ${session.dayLabel}`}
                    className="ml-1 text-muted hover:text-foreground"
                    onClick={() => run(() => removeMusician(residencyId, a.id))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
            {session.assignments.length === 0 && <li className="text-muted">No musicians yet</li>}
          </ul>

          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {notOnIt.length > 0 && (
                <select
                  aria-label={`Add a musician to ${session.dayLabel}`}
                  value=""
                  disabled={pending}
                  onChange={(ev) => ev.target.value && run(() => addMusician(residencyId, session.id, ev.target.value))}
                  className={`${inputClass} py-1 text-sm`}
                >
                  <option value="">Add a musician…</option>
                  {notOnIt.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              )}
              <select
                aria-label={`Room for ${session.dayLabel}`}
                value={session.locationId}
                disabled={pending}
                onChange={(ev) => run(() => setSessionRoom(residencyId, session.id, ev.target.value), "Room saved.")}
                className={`${inputClass} py-1 text-sm`}
              >
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              {session.isSpecialEvent && (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const f = new FormData(ev.currentTarget);
                    run(() => setSessionWhen(residencyId, session.id, String(f.get("date")), String(f.get("time")), timeZone), "Date and time saved.");
                  }}
                >
                  <input name="date" type="date" defaultValue={session.localDate} aria-label="Event date" className={`${inputClass} py-1 text-sm`} />
                  <input name="time" type="time" defaultValue={session.localTime} aria-label="Event time" className={`${inputClass} py-1 text-sm`} />
                  <button disabled={pending} className={small}>Move</button>
                </form>
              )}
            </div>
          )}

          {canSchedule && session.kind === "group_session" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Leader for ${session.dayLabel}`}
                value={leader?.personId ?? ""}
                disabled={pending || playing.length === 0}
                onChange={(ev) => run(() => setLeader(residencyId, session.id, ev.target.value), "Leader set.")}
                className={`${inputClass} py-1 text-sm ${leader ? "" : "border-brand-orange"}`}
              >
                <option value="">{playing.length ? "Pick a leader…" : "Add musicians first"}</option>
                {playing.map((a) => <option key={a.personId} value={a.personId}>{a.name}</option>)}
              </select>
              {!leader && playing.length > 0 && <span className="text-xs text-brand-orange">Needs a leader</span>}
            </div>
          )}

          {canSchedule && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Reason to cancel ${session.dayLabel}`}
                value={reason}
                onChange={(ev) => setReason(ev.target.value as CancellationReason)}
                className={`${inputClass} py-1 text-xs`}
              >
                {CANCELLATION_REASONS.map((r) => <option key={r} value={r}>{CANCELLATION_REASON_LABELS[r]}</option>)}
              </select>
              <button
                type="button"
                disabled={pending}
                className={small}
                onClick={() => {
                  if (confirm(`Mark ${session.dayLabel} as "No Program"? This can't be undone; add a new program if plans change.`))
                    run(() => cancelSession(residencyId, session.id, reason));
                }}
              >
                Make “No Program”
              </button>
            </div>
          )}
        </>
      )}
      {message && (
        <p role="status" className="mt-1 text-xs text-iris">{message}</p>
      )}
    </li>
  );
}
