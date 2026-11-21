"use client";

import { useActionState, useState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { addOneTimeSession, fillMonth, type ScheduleResult } from "../../schedule-actions";

export function FillMonthButton({ residencyId, month, monthLabel }: { residencyId: string; month: string; monthLabel: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() =>
          start(async () => {
            const r = await fillMonth(residencyId, month);
            setMessage(
              r.status === "error"
                ? r.message ?? "Something went wrong."
                : r.created
                  ? `Added ${r.created} program${r.created === 1 ? "" : "s"} from the weekly programs.`
                  : `${monthLabel} already has every weekly program.`,
            );
          })
        }
      >
        {pending ? "Filling in..." : `Fill in ${monthLabel}`}
      </button>
      {message && <p role="status" className="text-sm text-iris">{message}</p>}
    </div>
  );
}

const initial: ScheduleResult = { status: "idle" };

export function AddOneTimeForm({
  residencyId,
  timeZone,
  rooms,
  defaultDate,
}: {
  residencyId: string;
  timeZone: string;
  rooms: { id: string; label: string }[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(addOneTimeSession.bind(null, residencyId, timeZone), initial);
  const e = state.errors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="e.g. “Winter Concert”." error={e?.title}>
          <input name="title" required className={inputClass} />
        </Field>
        <Field label="Room" error={e?.location_id}>
          <select name="location_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Pick a room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Date" error={e?.date}>
          <input name="date" type="date" required defaultValue={defaultDate} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time" error={e?.time}>
            <input name="time" type="time" required className={inputClass} />
          </Field>
          <Field label="Minutes" error={e?.minutes}>
            <input name="minutes" type="number" min={5} max={600} step={5} defaultValue={60} required className={inputClass} />
          </Field>
        </div>
        <Field label="Call time (optional)" hint="For concerts." error={e?.call_time}>
          <input name="call_time" type="time" className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_special_event" defaultChecked /> Special event (its own section on the calendar)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_extra" /> Extra program (outside contracted hours)</label>
      </div>
      {state.status === "saved" && !pending && <p role="status" className="text-sm text-iris">Added as a draft.</p>}
      {!pending && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Adding..." : "Add program"}
      </button>
    </form>
  );
}
