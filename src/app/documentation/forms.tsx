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
import { createCalendarLink, deleteActivity, logActivity, resetCalendarLink, saveHours, saveReflection, saveSessionReport, type DocResult } from "./actions";

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
    report: { attendance: number; interactionTypeId: string; involvement: ResidentInvolvement; minutes: number; notes: string } | null;
  };
  types: Option[];
}) {
  const r = session.report;
  const [attendance, setAttendance] = useState(r ? String(r.attendance) : "");
  const [typeId, setTypeId] = useState(r?.interactionTypeId ?? "");
  const [involvement, setInvolvement] = useState<ResidentInvolvement>(r?.involvement ?? "none");
  const [minutes, setMinutes] = useState(String(r?.minutes ?? session.scheduledMinutes));
  const [notes, setNotes] = useState(r?.notes ?? "");
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
            });
            if (res.status === "saved") { setDone(true); setMsg("Saved."); } else setMsg(res.message ?? "Something went wrong.");
          });
        }}
      >
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

type Program = { id: string; name: string; sites: Option[] };

const initial: DocResult = { status: "idle" };

export function ActivityForm({
  programs,
  residents,
  defaultDate,
  minDate,
  maxDate,
}: {
  programs: Program[];
  residents: { id: string; siteId: string; name: string }[];
  defaultDate: string;
  minDate: string;
  maxDate: string;
}) {
  const [state, action, pending] = useActionState(logActivity, initial);
  const [residencyId, setResidencyId] = useState(programs[0]?.id ?? "");
  const program = programs.find((p) => p.id === residencyId);
  const [siteId, setSiteId] = useState(program?.sites[0]?.id ?? "");
  const [kind, setKind] = useState<ActivityKind>("one_to_one");
  const siteResidents = useMemo(() => residents.filter((r) => r.siteId === siteId), [residents, siteId]);
  const e = state.errors;
  return (
    <form
      action={action}
      key={state.savedAt ?? 0}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {programs.length > 1 && (
          <Field label="Program">
            <select
              name="residency_id"
              value={residencyId}
              onChange={(ev) => {
                setResidencyId(ev.target.value);
                setSiteId(programs.find((p) => p.id === ev.target.value)?.sites[0]?.id ?? "");
              }}
              className={inputClass}
            >
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {programs.length === 1 && <input type="hidden" name="residency_id" value={residencyId} />}
        <Field label="Site" error={e?.site_id}>
          <select name="site_id" value={siteId} onChange={(ev) => setSiteId(ev.target.value)} className={inputClass}>
            {program?.sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Date" error={e?.occurred_on}>
          <input name="occurred_on" type="date" defaultValue={defaultDate} min={minDate} max={maxDate} required className={inputClass} />
        </Field>
        <Field label="Type" error={e?.kind}>
          <select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as ActivityKind)} className={inputClass}>
            {ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{ACTIVITY_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minutes" error={e?.minutes}>
            <input name="minutes" inputMode="numeric" required className={inputClass} />
          </Field>
          <Field label="Collab?">
            <select name="collaborative" defaultValue="no" className={inputClass}>
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
                <input type="checkbox" name="resident_id" value={r.id} /> {r.name}
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
      <Field label="One-sentence note (optional)" hint="No health information.">
        <input name="note" maxLength={500} className={inputClass} />
      </Field>
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">Logged.</p>}
      {!pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : "Log activity"}
      </button>
    </form>
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

// ---- Weekly hours for one program (timesheet) ----

export function HoursCard({
  residencyId,
  programName,
  week,
  categories,
  initial,
  prefill,
  state,
  returnedNote,
}: {
  residencyId: string;
  programName: string | null;
  week: string;
  categories: { id: string; name: string; description: string | null }[];
  initial: Record<string, number>;
  prefill: Record<string, number>;
  state: "draft" | "submitted" | "approved" | null;
  returnedNote: string | null;
}) {
  const start = (id: string) => String(initial[id] ?? prefill[id] ?? 0);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((c) => [c.id, start(c.id)])));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const locked = state === "submitted" || state === "approved";
  const total = categories.reduce((n, c) => n + (Number(values[c.id]) || 0), 0);
  const save = (submit: boolean) =>
    startTransition(async () => {
      const r = await saveHours(residencyId, week, categories.map((c) => ({ categoryId: c.id, hours: Number(values[c.id]) || 0 })), submit);
      setMsg(r.status === "error" ? r.message ?? "Something went wrong." : submit ? "Submitted to the point person." : "Saved.");
    });
  return (
    <div className="flex flex-col gap-3">
      {programName && <h3 className="font-medium">{programName}</h3>}
      {returnedNote && state === "draft" && (
        <p className="rounded-lg border border-brand-orange/60 p-2 text-sm"><strong>Sent back by the point person:</strong> {returnedNote}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {categories.map((c) => (
          <Field key={c.id} label={c.name} hint={prefill[c.id] !== undefined && initial[c.id] === undefined ? `Pre-filled from your schedule and logs` : undefined}>
            <input
              inputMode="decimal"
              value={values[c.id]}
              disabled={locked}
              onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
              aria-label={`${c.name} hours`}
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      <p className="text-sm">
        Total: <strong>{total.toFixed(2)} hours</strong>
        <span className="ml-2 rounded-full bg-iris-soft px-2 py-0.5 text-xs">
          {state === "approved" ? "Approved" : state === "submitted" ? "Submitted, waiting for approval" : "Not submitted yet"}
        </span>
      </p>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} className={small} onClick={() => save(false)}>Save draft</button>
          <ConfirmButton
            disabled={pending}
            className={buttonClass}
            label="Submit hours"
            question={`Submit ${total.toFixed(2)} hours for this week?`}
            confirmLabel="Yes, submit"
            onConfirm={() => save(true)}
          />
        </div>
      )}
      {msg && <p role="status" className="text-sm text-iris">{msg}</p>}
    </div>
  );
}
