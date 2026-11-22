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
  setSessionNote,
  setSessionRoom,
  setSessionTitle,
  setSessionWhen,
  type ScheduleResult,
} from "../../schedule-actions";

// One date on the month schedule, laid out like the workbook scheduling tab:
// Day | Time | Program Title | Program Leader | Notes, with musicians, room and
// "No Program" under "More". Musicians on the roster edit titles, notes,
// rooms and who plays on drafts; schedulers do everything (v0.14).

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
  internalNote: string | null;
  assignments: { id: string; personId: string; name: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
};

type Option = { id: string; label: string };
const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";
const cell = `${inputClass} w-full py-1.5 text-sm`;

// Wide screens: one row like the workbook tab. Narrower (phones, side panes):
// day and time, then the title across the full width, then leader and notes.
export const SCHEDULE_GRID =
  "grid grid-cols-2 items-center gap-x-3 gap-y-1.5 lg:grid-cols-[9.5rem_4.5rem_minmax(14rem,1fr)_7rem_minmax(0,10rem)_3.5rem]";
const TITLE_CELL = "col-span-2 lg:col-span-1";
const OFFSET = "lg:pl-[14.75rem]";

export function ScheduleHeader() {
  return (
    <div className={`${SCHEDULE_GRID} hidden border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted lg:grid`}>
      <span>Day</span><span>Time</span><span>Program title</span><span>Leader</span><span>Notes</span><span />
    </div>
  );
}

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
  const [note, setNote] = useState(session.internalNote ?? "");
  const [open, setOpen] = useState(false);
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
  const saveTitle = () => {
    if (title.trim() && title !== session.title) run(() => setSessionTitle(residencyId, session.id, title), "Title saved.");
  };
  const saveNote = () => {
    if (note !== (session.internalNote ?? "")) run(() => setSessionNote(residencyId, session.id, note), "Note saved.");
  };

  return (
    <li className="border-b border-border py-2" data-session={session.id}>
      <div className={SCHEDULE_GRID}>
        <span className="text-sm font-medium">{session.dayLabel}</span>
        <span className="text-sm text-muted">{session.timeLabel ?? ""}</span>

        {canceled ? (
          <span className={`${TITLE_CELL} text-sm`}>
            {CANCELED_FOR_ABSENCE_CALENDAR_TEXT}
            {session.cancellationReason && <span className="text-xs text-muted"> ({CANCELLATION_REASON_LABELS[session.cancellationReason]})</span>}
          </span>
        ) : canEdit ? (
          <input
            aria-label={`Title for ${session.dayLabel}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={`${cell} ${TITLE_CELL}`}
          />
        ) : (
          <span className={`${TITLE_CELL} text-sm`}>{session.title}</span>
        )}

        {canceled || session.kind !== "group_session" ? (
          <span className="text-sm text-muted">–</span>
        ) : canSchedule ? (
          <select
            aria-label={`Leader for ${session.dayLabel}`}
            value={leader?.personId ?? ""}
            disabled={pending || playing.length === 0}
            onChange={(e) => run(() => setLeader(residencyId, session.id, e.target.value), "Leader set.")}
            className={`${cell} ${leader ? "" : "border-brand-orange"}`}
          >
            <option value="">{playing.length ? "Pick…" : "No musicians"}</option>
            {playing.map((a) => <option key={a.personId} value={a.personId}>{a.name}</option>)}
          </select>
        ) : (
          <span className={`text-sm ${leader ? "" : "text-brand-orange"}`}><span className="text-muted lg:hidden">Leader: </span>{leader?.name ?? "Not set"}</span>
        )}

        {canEdit ? (
          <input
            aria-label={`Notes for ${session.dayLabel}`}
            value={note}
            placeholder="Internal note"
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={cell}
          />
        ) : (
          <span className="text-sm text-muted">{session.internalNote ?? ""}</span>
        )}

        {canceled ? (
          <span />
        ) : (
          <button type="button" className={`${small} col-span-2 justify-self-start lg:col-span-1`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Less" : "More"}
          </button>
        )}
      </div>

      {!canceled && (
        <p className={`mt-1 text-xs text-muted ${OFFSET}`}>
          {playing.map((a) => `${a.name}${a.status === "substitute" ? " (sub)" : ""}`).join(", ") || "No musicians yet"} · {session.roomLabel}
          {!isDraft && " · Published"}
        </p>
      )}

      {open && !canceled && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-iris-soft/60 p-3 lg:ml-[14.75rem]">
          <ul className="flex flex-wrap gap-2 text-sm">
            {session.assignments.map((a) => (
              <li key={a.id} className={`flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 ${a.status === "absent" ? "text-muted line-through" : ""}`}>
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
          </ul>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {notOnIt.length > 0 && (
                <select
                  aria-label={`Add a musician to ${session.dayLabel}`}
                  value=""
                  disabled={pending}
                  onChange={(e) => e.target.value && run(() => addMusician(residencyId, session.id, e.target.value))}
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
                onChange={(e) => run(() => setSessionRoom(residencyId, session.id, e.target.value), "Room saved.")}
                className={`${inputClass} py-1 text-sm`}
              >
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              {session.isSpecialEvent && (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
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
          {canSchedule && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Reason to cancel ${session.dayLabel}`}
                value={reason}
                onChange={(e) => setReason(e.target.value as CancellationReason)}
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
        </div>
      )}
      {message && <p role="status" className={`mt-1 text-xs text-iris ${OFFSET}`}>{message}</p>}
    </li>
  );
}
