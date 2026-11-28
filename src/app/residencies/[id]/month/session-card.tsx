"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import {
  CANCELLATION_REASON_LABELS,
  CANCELED_FOR_ABSENCE_CALENDAR_TEXT,
  type CancellationReason,
} from "@/shared/domain/scheduling";
import {
  addMusician,
  deleteOneTimeSession,
  removeMusician,
  restoreSession,
  setLeader,
  setSessionNote,
  setSessionRoom,
  setSessionTitle,
  setSessionWhen,
  type ScheduleResult,
} from "../../schedule-actions";
import { askForSub, proposeLeader, setUnavailable, type CycleResult } from "../../month-cycle-actions";
import type { Stage } from "./stage-panel";

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
  /** A one-time date (no weekly program): the Iris Supervisor and admins can delete it (v0.37). */
  isOneTime?: boolean;
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
  isAdminLead,
  myId,
  monthReviewed = false,
  stage = null,
  myOpenRequests = [],
}: {
  residencyId: string;
  timeZone: string;
  session: CardSession;
  rooms: Option[];
  roster: Option[];
  onRoster: boolean;
  /** Iris Supervisor or admin (v0.18). */
  canSchedule: boolean;
  isAdminLead: boolean;
  myId: string;
  /** The Iris Supervisor marked this building's month reviewed: drafts lock for musicians (v0.25, built v0.35). */
  monthReviewed?: boolean;
  /** This building's month in the cycle (DOMAIN-MODEL ScheduleMonth, v0.41), if opened. */
  stage?: Stage | null;
  /** Dates I've already asked the Iris Supervisor about. */
  myOpenRequests?: string[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState(session.title);
  const [note, setNote] = useState(session.internalNote ?? "");
  const [open, setOpen] = useState(false);
  const [swapTo, setSwapTo] = useState("");
  const [subWho, setSubWho] = useState("");
  const isDraft = session.state === "draft";
  const canceled = session.state === "canceled";
  // DOMAIN-MODEL v0.18: musicians edit drafts they play in; the Iris Supervisor
  // and admins edit everything; the Lead Musician updates published dates.
  const playingMe = session.assignments.some((a) => a.personId === myId && a.status !== "absent");
  // Drafts lock for musicians once the month is reviewed; the Lead Musician keeps working on it (v0.35).
  const final = stage === "final";
  const canEdit = isDraft && !final && (canSchedule || (onRoster && playingMe && (!monthReviewed || isAdminLead)));
  // Published dates: the Lead Musician, the Iris Supervisor and admins (v0.18; who plays built v0.37).
  // After final, only the Iris Supervisor and admins (v0.41).
  const canEditPublished = (canSchedule || (isAdminLead && !final)) && session.state === "published";
  const canEditDetails = canEdit || canEditPublished;
  const canRestore = canSchedule || isAdminLead;
  const playing = session.assignments.filter((a) => a.status !== "absent");
  const leader = playing.find((a) => a.role === "leader");
  const notOnIt = roster.filter((r) => !session.assignments.some((a) => a.personId === r.id));
  const mine = session.assignments.find((a) => a.personId === myId);
  const iLead = !!leader && leader.personId === myId;
  // v0.41: while the team edits, only the date's leader changes its title; musicians propose leader swaps.
  const teamEditing = stage === "team_editing" || (!stage && !monthReviewed);
  const canEditTitle = canEditDetails && (canSchedule || !isDraft || iLead || (isAdminLead && !teamEditing));
  const canPickLeader = canSchedule || (isAdminLead && (canEdit || canEditPublished));
  const asked = myOpenRequests.includes(session.id);
  const canMarkOff = stage === "team_editing" && isDraft && !!mine && mine.status !== "substitute";
  const canPropose = stage === "team_editing" && isDraft && playingMe && !!leader && !canSchedule && !asked && playing.some((a) => a.role !== "leader");
  const canAskSub = final && playingMe && session.state === "published" && !canSchedule && !asked;
  const cycle = (fn: () => Promise<CycleResult>) =>
    start(async () => {
      const r = await fn();
      setMessage(r.message);
    });

  const run = (fn: () => Promise<ScheduleResult>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.status === "error" ? r.message ?? "Something went wrong." : done ?? null);
    });
  const saveTitle = () => {
    // D20: typing "No Program" makes the date No Program (the database does it).
    if (title.trim() && title !== session.title)
      run(() => setSessionTitle(residencyId, session.id, title), /^\W*no\W*program\W*$/i.test(title) ? "Marked “No Program”." : "Title saved.");
  };
  const saveNote = () => {
    if (note !== (session.internalNote ?? "")) run(() => setSessionNote(residencyId, session.id, note), "Note saved.");
  };

  return (
    <li className="border-b border-border py-2" data-session={session.id}>
      <div className={SCHEDULE_GRID}>
        <span className="text-sm font-medium">{session.dayLabel}</span>
        <span className="text-sm text-muted">{session.timeLabel ?? ""}</span>

        {canceled && canRestore && session.title === "No Program" ? (
          <input
            aria-label={`Title for ${session.dayLabel}`}
            title="Type a title to bring this date back as a draft"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={`${cell} ${TITLE_CELL}`}
          />
        ) : canceled ? (
          <span className={`${TITLE_CELL} text-sm`}>
            {CANCELED_FOR_ABSENCE_CALENDAR_TEXT}
            {session.cancellationReason && <span className="text-xs text-muted"> ({CANCELLATION_REASON_LABELS[session.cancellationReason]})</span>}
          </span>
        ) : canEditTitle ? (
          <input
            aria-label={`Title for ${session.dayLabel}`}
            title="Type “No Program” to cancel this date"
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
        ) : canPickLeader ? (
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

        {canEditDetails ? (
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
          canRestore ? (
            <span className="col-span-2 lg:col-span-1">
              <ConfirmButton
                disabled={pending}
                className={small}
                label="Restore"
                question={`Bring ${session.dayLabel} back as a draft?`}
                confirmLabel="Yes, restore"
                onConfirm={() => run(() => restoreSession(residencyId, session.id), "Restored as a draft. Find a sub or update it under More.")}
              />
            </span>
          ) : (
            <span />
          )
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
          {canEditDetails && (
            <div className="flex flex-wrap items-center gap-2">
              {canEditDetails && notOnIt.length > 0 && (
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
              {(session.isSpecialEvent || canSchedule || canEditPublished) && (
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
          {(canMarkOff || canPropose || canAskSub || asked) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
              {canMarkOff && (
                <button type="button" disabled={pending} className={small} onClick={() => cycle(() => setUnavailable(session.id, mine?.status !== "absent"))}>
                  {mine?.status === "absent" ? "Marked: I can't play (undo)" : "I can't play this date"}
                </button>
              )}
              {canPropose && (
                <>
                  <select aria-label={`Propose a leader for ${session.dayLabel}`} value={swapTo} onChange={(e) => setSwapTo(e.target.value)} className={`${inputClass} py-1 text-sm`}>
                    <option value="">Propose a different leader…</option>
                    {playing.filter((a) => a.role !== "leader").map((a) => <option key={a.personId} value={a.personId}>{a.name}</option>)}
                  </select>
                  <button type="button" disabled={pending || !swapTo} className={small} onClick={() => cycle(() => proposeLeader(session.id, swapTo))}>Send to the Iris Supervisor</button>
                </>
              )}
              {canAskSub && (
                <>
                  <select aria-label={`Sub for ${session.dayLabel}`} value={subWho} onChange={(e) => setSubWho(e.target.value)} className={`${inputClass} py-1 text-sm`}>
                    <option value="">Ask for a sub…</option>
                    {notOnIt.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <button type="button" disabled={pending || !subWho} className={small} onClick={() => cycle(() => askForSub(session.id, subWho))}>Ask the Iris Supervisor</button>
                </>
              )}
              {asked && <span className="text-xs text-muted">You&apos;ve asked the Iris Supervisor about this date; they&apos;ll decide.</span>}
            </div>
          )}
          {canSchedule && session.isOneTime && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <ConfirmButton
                disabled={pending}
                className={`${small} border-red-600/50 text-red-700 dark:text-red-400`}
                label={session.isSpecialEvent ? "Delete event" : "Delete date"}
                question={`Delete “${session.title}” on ${session.dayLabel}${isDraft ? "" : ", which is already on the published calendar"}? This can't be undone.`}
                confirmLabel="Yes, delete"
                onConfirm={() => run(() => deleteOneTimeSession(residencyId, session.id), "Deleted.")}
              />
              <span className="text-xs text-muted">For an event added by mistake or no longer happening. Once it&apos;s documented, make it “No Program” instead.</span>
            </div>
          )}
        </div>
      )}
      {message && <p role="status" className={`mt-1 text-xs text-iris ${OFFSET}`}>{message}</p>}
    </li>
  );
}
