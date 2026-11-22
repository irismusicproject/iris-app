"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { SESSION_KIND_LABELS, SESSION_KINDS, WEEKDAYS, type Series, type SessionKind } from "@/shared/domain/scheduling";
import { saveSeries, type ScheduleResult } from "../../schedule-actions";

type Option = { id: string; label: string };
const initial: ScheduleResult = { status: "idle" };

export function SeriesForm({
  residencyId,
  series,
  defaultPeople = [],
  rooms,
  musicians,
}: {
  residencyId: string;
  series?: Series;
  defaultPeople?: string[];
  rooms: Option[];
  musicians: Option[];
}) {
  const [state, action, pending] = useActionState(saveSeries.bind(null, residencyId, series?.id ?? null), initial);
  const [kind, setKind] = useState<SessionKind>(series?.kind ?? "group_session");
  const e = state.errors;
  const timeOptional = kind === "relationship_building";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="Title only, e.g. “Jam Band” or “Lessons”. Musicians' names are added when printing." error={e?.title}>
          <input name="title" required defaultValue={series?.title} className={inputClass} />
        </Field>
        <Field label="Kind" error={e?.kind}>
          <select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as SessionKind)} className={inputClass}>
            {SESSION_KINDS.map((k) => <option key={k} value={k}>{SESSION_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Room" error={e?.default_location_id}>
          <select name="default_location_id" required defaultValue={series?.default_location_id ?? ""} className={inputClass}>
            <option value="" disabled>Pick a room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={timeOptional ? "Time (optional)" : "Time"} error={e?.start_time}>
            <input name="start_time" type="time" required={!timeOptional} defaultValue={series?.start_time?.slice(0, 5) ?? ""} className={inputClass} />
          </Field>
          <Field label={timeOptional ? "Minutes (optional)" : "Minutes"} error={e?.minutes}>
            <input name="minutes" type="number" min={5} max={600} step={5} required={!timeOptional} defaultValue={series?.minutes ?? (timeOptional ? "" : 45)} className={inputClass} />
          </Field>
        </div>
        <Field label="Starts" error={e?.active_from}>
          <input name="active_from" type="date" required defaultValue={series?.active_from ?? ""} className={inputClass} />
        </Field>
        <Field label="Ends (optional)" hint="Leave blank if it continues." error={e?.active_until}>
          <input name="active_until" type="date" defaultValue={series?.active_until ?? ""} className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Days</legend>
        {e?.weekdays && <p className="text-xs text-red-600 dark:text-red-400">{e.weekdays}</p>}
        <div className="mt-2 flex flex-wrap gap-3">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="weekdays" value={d.value} defaultChecked={series?.weekdays.includes(d.value)} /> {d.short}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Usual musicians</legend>
        <p className="text-xs text-muted">Added to each date when the month is filled in. Anyone on the roster can change them per date.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {musicians.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="default_person_id" value={m.id} defaultChecked={defaultPeople.includes(m.id)} /> {m.label}
            </label>
          ))}
          {musicians.length === 0 && <p className="text-sm text-muted">Add musicians to the season&apos;s roster first.</p>}
        </div>
      </fieldset>
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">Saved.</p>}
      {!pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : series ? "Save weekly program" : "Add weekly program"}
      </button>
    </form>
  );
}
