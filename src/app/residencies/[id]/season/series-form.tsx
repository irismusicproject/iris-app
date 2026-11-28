"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { SESSION_KIND_LABELS, SESSION_KINDS, WEEK_OF_MONTH_LABELS, WEEKDAYS, type Series, type SessionKind } from "@/shared/domain/scheduling";
import { deleteSeries, endSeries, saveSeries, type EndResult, type ScheduleResult } from "../../schedule-actions";

// A recurring program (Series): weekly on chosen days, or monthly on the
// 1st–4th of a weekday (e.g. a concert on the 4th Monday). DOMAIN-MODEL v0.18.

type Option = { id: string; label: string };
const initial: ScheduleResult = { status: "idle" };

export function SeriesForm({
  residencyId,
  series,
  defaultPeople = [],
  rooms,
  musicians,
  types = [],
}: {
  residencyId: string;
  series?: Series;
  defaultPeople?: string[];
  rooms: Option[];
  musicians: Option[];
  types?: Option[];
}) {
  const [state, action, pending] = useActionState(saveSeries.bind(null, residencyId, series?.id ?? null), initial);
  const [kind, setKind] = useState<SessionKind>(series?.kind ?? "group_session");
  const [recurrence, setRecurrence] = useState<"weekly" | "monthly">(series?.recurrence ?? "weekly");
  const e = state.errors;
  const timeOptional = kind === "relationship_building";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="Title only, e.g. “Jam Band”, “Lessons” or “Monthly Concert”. Musicians' names are added when printing." error={e?.title}>
          <input name="title" required defaultValue={series?.title} className={inputClass} />
        </Field>
        <Field label="Kind" error={e?.kind}>
          <select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as SessionKind)} className={inputClass}>
            {SESSION_KINDS.map((k) => <option key={k} value={k}>{SESSION_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Repeats">
          <select name="recurrence" value={recurrence} onChange={(ev) => setRecurrence(ev.target.value as "weekly" | "monthly")} className={inputClass}>
            <option value="weekly">Every week</option>
            <option value="monthly">Once a month</option>
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
          <Field
            label={timeOptional ? "Minutes (optional)" : "Length (minutes)"}
            error={e?.minutes}
            hint={timeOptional ? undefined : "Musicians won't retype it when documenting. Changing it updates every date not yet documented."}
          >
            <input name="minutes" type="number" min={5} max={600} step={5} required={!timeOptional} defaultValue={series?.minutes ?? (timeOptional ? "" : 45)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" error={e?.active_from}>
            <input name="active_from" type="date" required defaultValue={series?.active_from ?? ""} className={inputClass} />
          </Field>
          <Field label="Ends (optional)" error={e?.active_until}>
            <input name="active_until" type="date" defaultValue={series?.active_until ?? ""} className={inputClass} />
          </Field>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{recurrence === "monthly" ? "Which day each month" : "Days"}</legend>
        {(e?.weekdays || e?.week_of_month) && <p className="text-xs text-red-600 dark:text-red-400">{e?.weekdays ?? e?.week_of_month}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {recurrence === "monthly" && (
            <select name="week_of_month" defaultValue={series?.week_of_month ?? 1} aria-label="Which week of the month" className={`${inputClass} py-1.5`}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{WEEK_OF_MONTH_LABELS[n]}</option>)}
            </select>
          )}
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm">
              <input
                type={recurrence === "monthly" ? "radio" : "checkbox"}
                name="weekdays"
                value={d.value}
                defaultChecked={series?.weekdays.includes(d.value)}
              />{" "}
              {d.short}
            </label>
          ))}
          {recurrence === "monthly" && <span className="text-xs text-muted">e.g. 4th + Mon = the 4th Monday of each month</span>}
        </div>
      </fieldset>
      {recurrence === "weekly" && (
        <fieldset>
          <legend className="text-sm font-medium">Skip a week each month (optional)</legend>
          <p className="text-xs text-muted">
            E.g. at Landow every Monday except the 2nd, when the ensemble is at Revitz: tick 2nd here, and add a monthly program on the 2nd Monday at Revitz. Skipped dates show as “No Program”.
          </p>
          {e?.skip_weeks_of_month && <p className="text-xs text-red-600 dark:text-red-400">{e.skip_weeks_of_month}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="skip_weeks_of_month" value={n} defaultChecked={series?.skip_weeks_of_month?.includes(n)} /> {WEEK_OF_MONTH_LABELS[n]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {kind === "group_session" && (
        <Field label="Usual leader (optional)" hint="Made leader on every date when a month is filled in. Leave blank and the Iris Supervisor picks each date's leader.">
          <select name="default_leader_id" defaultValue={series?.default_leader_id ?? ""} className={inputClass}>
            <option value="">No usual leader</option>
            {musicians.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
      )}
      {kind === "group_session" && types.length > 0 && (
        <Field label="Usual type (optional)" hint="Already picked when the leader documents; they change it only when it was different.">
          <select name="default_interaction_type_id" defaultValue={series?.default_interaction_type_id ?? ""} className={inputClass}>
            <option value="">Leader picks each time</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
      )}
      <fieldset>
        <legend className="text-sm font-medium">Usual musicians</legend>
        <p className="text-xs text-muted">Added to each date when a month is filled in. Musicians can change them on dates they play.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {musicians.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="default_person_id" value={m.id} defaultChecked={defaultPeople.includes(m.id)} /> {m.label}
            </label>
          ))}
          {musicians.length === 0 && <p className="text-sm text-muted">Add musicians to the season&apos;s roster first.</p>}
        </div>
      </fieldset>
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">{state.message ?? "Saved."}</p>}
      {state.status === "error" && !pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : series ? "Save program" : "Add program"}
      </button>
    </form>
  );
}

// Ending a program mid-season, or deleting one set up by mistake (v0.34).
const endInitial: EndResult = { status: "idle" };

// After ending or deleting, the program may drop off this month's list, so the
// result shows as a banner at the top of the page (?ended= / ?deleted=).
function useShowResult() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (extra: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["ended", "deleted", "removed"]) next.delete(k);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: true });
  };
}

export function EndSeriesForm({ residencyId, series, today }: { residencyId: string; series: Series; today: string }) {
  const [state, action, pending] = useActionState(endSeries.bind(null, residencyId, series.id), endInitial);
  const show = useShowResult();
  const defaultLast = series.active_until ?? (today < series.active_from ? series.active_from : today);
  useEffect(() => {
    if (state.status === "saved") show({ ended: series.id, removed: String(state.removed ?? 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        For changes mid-season. Past dates, and anything documented or paid, stay. Draft dates after the last date are removed. Published dates after it stay on the calendar until you make them “No Program”.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Last date">
          <input name="last_date" type="date" required min={series.active_from} defaultValue={defaultLast} className={`${inputClass} py-1.5`} />
        </Field>
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Ending..." : "End program"}</button>
      </div>
      {state.status === "error" && !pending && <FormError message={state.message} />}
    </form>
  );
}

export function DeleteSeriesButton({ residencyId, seriesId, title, dateCount }: { residencyId: string; seriesId: string; title: string; dateCount: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const show = useShowResult();
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted">For duplicates or programs set up by mistake. Removes the program and all its dates. Not possible once a date is documented or in an approved week; end it instead.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const dates = dateCount ? ` and its ${dateCount} date${dateCount === 1 ? "" : "s"} (including any already published)` : "";
          if (!window.confirm(`Delete “${title}”${dates}? This can't be undone.`)) return;
          start(async () => {
            const r = await deleteSeries(residencyId, seriesId);
            if (r.status === "error") setMsg(r.message ?? "Something went wrong.");
            else show({ deleted: title.slice(0, 80), removed: String(r.removed ?? 0) });
          });
        }}
        className="self-start rounded-lg border border-red-600/50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {pending ? "Deleting..." : "Delete program"}
      </button>
      {msg && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{msg}</p>}
    </div>
  );
}
