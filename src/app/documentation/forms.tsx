"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  residentsRequired,
  type ActivityKind,
  type ResidentInvolvement,
} from "@/shared/domain/documentation";
import { createCalendarLink, deleteActivity, leaveSharedActivity, logActivity, resetCalendarLink, saveReflection, saveSessionReport, submitWeek, type DocResult } from "./actions";

const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";
type Option = { id: string; label: string };

// ---- One program the musician led (SessionReport) ----

export function ReportRow({
  session,
  types,
}: {
  session: {
    id: string;
    day: string;
    time: string;
    title: string;
    place: string;
    scheduledMinutes: number;
    /** The program's usual type, pre-selected (v0.21). */
    usualTypeId?: string;
    report: { attendance: number; interactionTypeId: string; involvement: ResidentInvolvement; minutes: number; notes: string; siteId: string | null } | null;
    /** The program's buildings, and the scheduled room's building (v0.24). */
    sites: Option[];
    roomSiteId: string;
  };
  types: Option[];
}) {
  const r = session.report;
  const [attendance, setAttendance] = useState(r ? String(r.attendance) : "");
  const [typeId, setTypeId] = useState(r?.interactionTypeId ?? session.usualTypeId ?? "");
  const [involvement, setInvolvement] = useState<ResidentInvolvement>(r?.involvement ?? "none");
  const [minutes, setMinutes] = useState(String(r?.minutes ?? session.scheduledMinutes));
  const [notes, setNotes] = useState(r?.notes ?? "");
  const [siteId, setSiteId] = useState(r?.siteId ?? session.roomSiteId);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(!!r);
  // The length comes from the program (set by the point person or an admin,
  // v0.20). The leader only changes it when the session ran longer or shorter.
  const [editLength, setEditLength] = useState(!!r && r.minutes !== session.scheduledMinutes);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{session.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${done ? "bg-iris-soft text-iris" : "border border-brand-orange text-brand-orange"}`}>
          {done ? "Documented" : "To document"}
        </span>
      </div>
      <p className="text-sm text-muted">{session.day}{session.time ? ` · ${session.time}` : ""} · {session.place}</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[6rem_1fr_8rem]"
        onSubmit={(ev) => {
          ev.preventDefault();
          start(async () => {
            const res: DocResult = await saveSessionReport(session.id, {
              attendance: Number(attendance),
              interactionTypeId: typeId,
              involvement,
              minutes: editLength ? Number(minutes) : session.scheduledMinutes,
              notes,
              siteId,
            });
            if (res.status === "saved") { setDone(true); setMsg("Saved."); } else setMsg(res.message ?? "Something went wrong.");
          });
        }}
      >
        {session.sites.length > 1 && (
          <div className="sm:col-span-3">
            <Field label="Building" hint="Where the program happened. Attendance and billing count it here.">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`${inputClass} sm:w-72`}>
                {session.sites.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field label="Attendance">
          <input inputMode="numeric" value={attendance} onChange={(e) => setAttendance(e.target.value)} required className={inputClass} />
        </Field>
        <Field label="Type">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required className={inputClass}>
            <option value="" disabled>Pick a type</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Collab?">
          {/* Yes/No (v0.19): every "Yes" counts toward the collaboration target, stored as co_led. */}
          <select value={involvement === "none" ? "none" : "co_led"} onChange={(e) => setInvolvement(e.target.value as ResidentInvolvement)} className={inputClass}>
            <option value="none">No</option>
            <option value="co_led">Yes</option>
          </select>
        </Field>
        <div className="text-sm sm:col-span-3">
          {editLength ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="How long it actually ran (minutes)">
                <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} required className={`${inputClass} w-28`} />
              </Field>
              <button
                type="button"
                className="pb-2 text-xs text-muted underline"
                onClick={() => {
                  setEditLength(false);
                  setMinutes(String(session.scheduledMinutes));
                }}
              >
                Use the usual {session.scheduledMinutes} min
              </button>
            </div>
          ) : (
            <p>
              Length: <strong>{session.scheduledMinutes} min</strong>{" "}
              <button type="button" className="ml-1 text-xs text-iris underline" onClick={() => setEditLength(true)}>
                Ran longer or shorter?
              </button>
            </p>
          )}
        </div>
        <div className="sm:col-span-3">
          <Field label="Notes (optional)" hint="Music and group engagement only. No health information.">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button disabled={pending} className={small}>{pending ? "Saving..." : done ? "Update" : "Save"}</button>
          {msg && <span role="status" className="text-xs text-iris">{msg}</span>}
        </div>
      </form>
    </li>
  );
}

// ---- Log a relationship-building activity ----
// v0.21: the usual length per type (set by the point person) fills Minutes;
// the date and site stay after each log so several one-to-ones in a day are
// quick; "Same as last time" copies the last activity. Sites with detailed
// notes get a paragraph note for the partner's daily document.

type Program = { id: string; name: string; sites: (Option & { detailedNotes?: boolean })[] };
export type LastActivity = { residencyId: string; siteId: string; kind: ActivityKind; minutes: number; collaborative: boolean; residentIds: string[] };

const initial: DocResult = { status: "idle" };

export function ActivityForm({
  programs,
  residents,
  defaultDate,
  minDate,
  maxDate,
  lengths = {},
  last = null,
  colleagues = {},
}: {
  programs: Program[];
  residents: { id: string; siteId: string; name: string }[];
  defaultDate: string;
  minDate: string;
  maxDate: string;
  /** Usual minutes per type, per program (residency id). */
  lengths?: Record<string, Partial<Record<ActivityKind, number>>>;
  last?: LastActivity | null;
  /** Other roster musicians per program, who can share a log (v0.24). */
  colleagues?: Record<string, Option[]>;
}) {
  const [state, action, pending] = useActionState(logActivity, initial);
  const [residencyId, setResidencyId] = useState(programs[0]?.id ?? "");
  const program = programs.find((p) => p.id === residencyId);
  const [siteId, setSiteId] = useState(program?.sites[0]?.id ?? "");
  const [kind, setKind] = useState<ActivityKind>("one_to_one");
  const usual = (rid: string, k: ActivityKind) => (lengths[rid]?.[k] ? String(lengths[rid]![k]) : "");
  const [minutes, setMinutes] = useState(usual(residencyId, "one_to_one"));
  const [date, setDate] = useState(defaultDate);
  const [collab, setCollab] = useState("no");
  const [picked, setPicked] = useState<string[]>([]);
  const [withIds, setWithIds] = useState<string[]>([]);
  // Detailed-notes buildings (v0.36): room and start/end time; minutes come from the times.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [seen, setSeen] = useState(state.savedAt);
  if (state.savedAt !== seen) {
    // Logged: clear who and how long, keep program, site, type and date.
    setSeen(state.savedAt);
    setPicked([]);
    setWithIds([]);
    setCollab("no");
    setMinutes(usual(residencyId, kind));
    setStartTime("");
    setEndTime("");
  }
  const siteResidents = useMemo(() => residents.filter((r) => r.siteId === siteId), [residents, siteId]);
  const detailed = !!program?.sites.find((x) => x.id === siteId)?.detailedNotes;
  const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const span = toMin(startTime) != null && toMin(endTime) != null ? toMin(endTime)! - toMin(startTime)! : null;
  const lastUsable = last && programs.some((p) => p.id === last.residencyId && p.sites.some((x) => x.id === last.siteId));
  const e = state.errors;
  return (
    <form action={action} key={state.savedAt ?? 0} className="flex flex-col gap-4">
      {lastUsable && (
        <button
          type="button"
          className={`${small} self-start`}
          onClick={() => {
            setResidencyId(last!.residencyId);
            setSiteId(last!.siteId);
            setKind(last!.kind);
            setMinutes(String(last!.minutes));
            setCollab(last!.collaborative ? "yes" : "no");
            setPicked(last!.residentIds);
          }}
        >
          Same as last time
        </button>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {programs.length > 1 && (
          <Field label="Program">
            <select
              name="residency_id"
              value={residencyId}
              onChange={(ev) => {
                setResidencyId(ev.target.value);
                setSiteId(programs.find((p) => p.id === ev.target.value)?.sites[0]?.id ?? "");
                setMinutes(usual(ev.target.value, kind));
                setPicked([]);
              }}
              className={inputClass}
            >
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {programs.length === 1 && <input type="hidden" name="residency_id" value={residencyId} />}
        <Field label="Site" error={e?.site_id}>
          <select name="site_id" value={siteId} onChange={(ev) => { setSiteId(ev.target.value); setPicked([]); }} className={inputClass}>
            {program?.sites.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Date" error={e?.occurred_on}>
          <input name="occurred_on" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} min={minDate} max={maxDate} required className={inputClass} />
        </Field>
        <Field label="Type" error={e?.kind}>
          <select
            name="kind"
            value={kind}
            onChange={(ev) => {
              const k = ev.target.value as ActivityKind;
              setKind(k);
              if (usual(residencyId, k)) setMinutes(usual(residencyId, k));
            }}
            className={inputClass}
          >
            {ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{ACTIVITY_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        {detailed && (
          <>
            <Field label="Room" hint="Where the visit happened, e.g. “312” or “Library”." error={e?.visit_room}>
              <input name="visit_room" maxLength={60} required className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time" error={e?.start_time}>
                <input name="start_time" type="time" value={startTime} onChange={(ev) => setStartTime(ev.target.value)} required className={inputClass} />
              </Field>
              <Field label="End time" error={e?.end_time} hint={span != null ? (span > 0 ? `${span} minutes` : "Must be after the start") : undefined}>
                <input name="end_time" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} required className={inputClass} />
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          {detailed ? (
            <input type="hidden" name="minutes" value={span != null && span > 0 ? span : ""} />
          ) : (
            <Field label="Minutes" error={e?.minutes}>
              <input name="minutes" inputMode="numeric" value={minutes} onChange={(ev) => setMinutes(ev.target.value)} required className={inputClass} />
            </Field>
          )}
          <Field label="Collab?">
            <select name="collaborative" value={collab} onChange={(ev) => setCollab(ev.target.value)} className={inputClass}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">
          Residents{residentsRequired(kind) ? "" : " (optional for hallway concerts)"}
        </legend>
        {e?.residents && <p className="text-xs text-red-600 dark:text-red-400">{e.residents}</p>}
        {siteResidents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {siteResidents.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
                <input
                  type="checkbox"
                  name="resident_id"
                  value={r.id}
                  checked={picked.includes(r.id)}
                  onChange={(ev) => setPicked((cur) => (ev.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)))}
                />{" "}
                {r.name}
              </label>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Field
            label={siteResidents.length ? "Someone new? Add them" : "Add residents"}
            hint="First name and last initial, separated by commas, e.g. “Ruth K., Sam P.”. No health information."
            error={e?.new_residents}
          >
            <input name="new_residents" className={inputClass} />
          </Field>
        </div>
      </fieldset>
      {(colleagues[residencyId]?.length ?? 0) > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Other musicians (optional)</legend>
          <p className="text-xs text-muted">Did someone else do this with you? Add them: they&apos;re credited the same minutes, and you document it once.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {colleagues[residencyId]!.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
                <input
                  type="checkbox"
                  name="other_musician_id"
                  value={c.id}
                  checked={withIds.includes(c.id)}
                  onChange={(ev) => setWithIds((cur) => (ev.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
                />{" "}
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {detailed ? (
        <Field label="Note for the partner" hint="A few sentences on what you did together; goes in the day's document for this site. No health information." error={e?.note}>
          <textarea name="note" maxLength={3000} rows={4} required className={inputClass} />
          <input type="hidden" name="detailed" value="1" />
        </Field>
      ) : (
        <Field label="One-sentence note (optional)" hint="No health information.">
          <input name="note" maxLength={500} className={inputClass} />
        </Field>
      )}
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">Logged. Date and site are kept for the next one.</p>}
      {!pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : "Log activity"}
      </button>
    </form>
  );
}

export function LeaveSharedButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      disabled={pending}
      className="text-xs text-muted underline"
      label="Not me"
      ariaLabel={`Take yourself off ${label}`}
      question="Take yourself off this log?"
      confirmLabel="Yes"
      onConfirm={() => start(async () => { await leaveSharedActivity(id); })}
    />
  );
}

export function DeleteActivityButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      disabled={pending}
      ariaLabel={`Delete ${label}`}
      className={small}
      label="Delete"
      question="Delete this activity?"
      confirmLabel="Yes, delete"
      onConfirm={() => start(async () => { await deleteActivity(id); })}
    />
  );
}

// ---- Monthly reflection ----

export function ReflectionForm({
  residencyId,
  month,
  highlights,
  challenges,
}: {
  residencyId: string;
  month: string;
  highlights: string;
  challenges: string;
}) {
  const [state, action, pending] = useActionState(saveReflection.bind(null, residencyId, month), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Highlights and successes" hint="What am I most proud of this month?">
        <textarea name="highlights" rows={3} defaultValue={highlights} className={inputClass} />
      </Field>
      <Field label="Challenges and suggestions" hint="What were my biggest barriers to success this month?">
        <textarea name="challenges" rows={3} defaultValue={challenges} className={inputClass} />
      </Field>
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">Saved.</p>}
      {!pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : "Save reflection"}
      </button>
    </form>
  );
}

// ---- Private calendar link ----

export function CalendarLinkCard({ feedUrl }: { feedUrl: string | null }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const webcal = feedUrl?.replace(/^https?:/, "webcal:");
  return (
    <div className="flex flex-col gap-3 text-sm">
      {!feedUrl ? (
        <>
          <p className="text-muted">
            Get a private link that adds your Iris programs (the ones you play in, plus your programs&apos; special events) to Google,
            Apple or Outlook Calendar. It updates on its own when the schedule changes.
          </p>
          <button type="button" disabled={pending} className={`${buttonClass} self-start`} onClick={() => start(async () => { await createCalendarLink(); })}>
            {pending ? "Creating..." : "Create my calendar link"}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={feedUrl} aria-label="Your private calendar link" className={`${inputClass} min-w-0 flex-1 text-xs`} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className={small}
              onClick={async () => {
                await navigator.clipboard.writeText(feedUrl);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li><strong>Apple Calendar or iPhone:</strong> <a href={webcal} className="text-iris underline-offset-2 hover:underline">tap here to subscribe</a>.</li>
            <li><strong>Google Calendar:</strong> on a computer, Other calendars → “+” → From URL, then paste the link.</li>
            <li><strong>Outlook:</strong> Add calendar → Subscribe from web, then paste the link.</li>
          </ul>
          <p className="text-xs text-muted">
            Keep this link to yourself: anyone with it can see your Iris schedule.{" "}
            <ConfirmButton
              disabled={pending}
              className="underline underline-offset-2"
              label="Make a new link"
              question="Make a new link? The old one stops working; you'll subscribe again."
              confirmLabel="Yes, new link"
              onConfirm={() => start(async () => { await resetCalendarLink(); setCopied(false); })}
            />
          </p>
        </>
      )}
    </div>
  );
}

// ---- The week's hours (v0.24): calculated from documentation, one submit ----

export type WeekHoursProgram = {
  residencyId: string;
  programName: string;
  hours: { name: string; hours: number }[];
  state: "draft" | "submitted" | "approved" | null;
  returnedNote: string | null;
};

export function WeekHours({ week, programs, toDocument }: { week: string; programs: WeekHoursProgram[]; toDocument: string[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const open = programs.filter((p) => p.state !== "submitted" && p.state !== "approved");
  const sum = (p: WeekHoursProgram) => p.hours.reduce((n, h) => n + h.hours, 0);
  const total = open.reduce((n, p) => n + sum(p), 0);
  return (
    <div className="flex flex-col gap-6">
      {programs.map((p) => (
        <div key={p.residencyId} className="flex flex-col gap-2">
          {programs.length > 1 && <h3 className="font-medium">{p.programName}</h3>}
          {p.returnedNote && p.state === "draft" && (
            <p className="rounded-lg border border-brand-orange/60 p-2 text-sm"><strong>Sent back by the point person:</strong> {p.returnedNote}</p>
          )}
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {p.hours.map((h) => (
              <div key={h.name} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">{h.name}</dt>
                <dd className="text-lg font-semibold">{h.hours.toFixed(2)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            Total: <strong>{sum(p).toFixed(2)} hours</strong>
            <span className="ml-2 rounded-full bg-iris-soft px-2 py-0.5 text-xs">
              {p.state === "approved" ? "Approved" : p.state === "submitted" ? "Submitted, waiting for approval" : "Not submitted yet"}
            </span>
          </p>
        </div>
      ))}
      {open.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {toDocument.length > 0 && <p className="text-sm text-brand-orange">Before you submit, document: {toDocument.join(", ")}.</p>}
          <ConfirmButton
            disabled={pending || toDocument.length > 0}
            className={`${buttonClass} self-start`}
            label="Submit my week"
            question={`Submit your documentation and ${total.toFixed(2)} hours for this week?`}
            confirmLabel="Yes, submit"
            onConfirm={() =>
              startTransition(async () => {
                const r = await submitWeek(week, open.map((p) => p.residencyId));
                setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Your week is submitted to the point person.");
              })
            }
          />
        </div>
      )}
      {msg && <p role="status" className="text-sm text-iris">{msg}</p>}
    </div>
  );
}
