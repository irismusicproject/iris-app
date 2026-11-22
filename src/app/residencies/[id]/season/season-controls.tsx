"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass } from "@/components/auth-card";
import { fillSeason, setActivityLengths, setCollaborationTarget, setSeriesLeaderForSeason } from "../../schedule-actions";

export function SeasonLeaderSelect({
  residencyId,
  seriesId,
  seriesTitle,
  current,
  musicians,
}: {
  residencyId: string;
  seriesId: string;
  seriesTitle: string;
  current: string | null;
  musicians: { id: string; label: string }[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const apply = (next: string) =>
    start(async () => {
      const r = await setSeriesLeaderForSeason(residencyId, seriesId, next);
      setMsg(
        r.status === "error"
          ? r.message ?? "Something went wrong."
          : next
            ? `Leader on ${r.changed} draft date${r.changed === 1 ? "" : "s"} from today on.`
            : "No usual leader. Existing dates keep their leaders.",
      );
    });
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Leader all season for ${seriesTitle}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          apply(e.target.value);
        }}
        className={`${inputClass} py-1.5 text-sm ${value ? "" : "border-brand-orange"}`}
      >
        <option value="">No usual leader (pick per date)</option>
        {musicians.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {value && (
        <button type="button" disabled={pending} onClick={() => apply(value)} className="self-start text-xs text-iris underline-offset-2 hover:underline">
          Apply to all draft dates
        </button>
      )}
      {msg && <span role="status" className="text-xs text-iris">{msg}</span>}
    </div>
  );
}

export function FillSeasonButton({ residencyId, seasonId, seasonName }: { residencyId: string; seasonId: string; seasonName: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() =>
          start(async () => {
            const r = await fillSeason(residencyId, seasonId);
            setMsg(r.status === "error" ? r.message ?? "Something went wrong." : r.created ? `Added ${r.created} draft programs.` : "Every month is already filled in.");
          })
        }
      >
        {pending ? "Filling in..." : `Fill the whole season`}
      </button>
      <span className="text-xs text-muted">Fills every month of {seasonName} from the weekly programs, with usual leaders. Months already filled get only what&apos;s missing.</span>
      {msg && <p role="status" className="w-full text-sm text-iris">{msg}</p>}
    </div>
  );
}

export function CollaborationTargetForm({ residencyId, seasonId, value }: { residencyId: string; seasonId: string; value: number }) {
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setCollaborationTarget(residencyId, seasonId, Number(v));
          setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Saved.");
        });
      }}
    >
      <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} aria-label="Collaborative programs per musician" className={`${inputClass} w-20 py-1.5`} />
      <span className="text-sm">collaborative programs per musician this season</span>
      <button disabled={pending} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">{pending ? "Saving..." : "Save"}</button>
      {msg && <span role="status" className="text-xs text-iris">{msg}</span>}
    </form>
  );
}

const LENGTH_KINDS = [
  { kind: "one_to_one", label: "One-to-one" },
  { kind: "mini_group", label: "Mini-group session" },
  { kind: "hallway_concert", label: "Hallway concert" },
];

/** Usual minutes per relationship-building type; fills the musicians' log form (v0.21). */
export function ActivityLengthsForm({ residencyId, values }: { residencyId: string; values: Record<string, number> }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(LENGTH_KINDS.map((k) => [k.kind, values[k.kind] ? String(values[k.kind]) : ""])));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setActivityLengths(residencyId, LENGTH_KINDS.map((k) => ({ kind: k.kind, minutes: Number(v[k.kind] || 0) })));
          setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Saved.");
        });
      }}
    >
      <div className="flex flex-wrap gap-4">
        {LENGTH_KINDS.map((k) => (
          <label key={k.kind} className="flex items-center gap-2 text-sm">
            {k.label}
            <input
              inputMode="numeric"
              value={v[k.kind]}
              onChange={(e) => setV((cur) => ({ ...cur, [k.kind]: e.target.value }))}
              aria-label={`${k.label} minutes`}
              className={`${inputClass} w-20 py-1.5`}
            />
            min
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">{pending ? "Saving..." : "Save"}</button>
        {msg && <span role="status" className="text-xs text-iris">{msg}</span>}
      </div>
    </form>
  );
}
