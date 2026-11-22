"use client";

import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { inputClass } from "@/components/auth-card";
import { mergePerson } from "./actions";

/** Merge a duplicate who has never signed in into another person (v0.33). */
export function MergePerson({ id, name, others }: { id: string; name: string; others: { id: string; name: string; email: string }[] }) {
  const [into, setInto] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const keep = others.find((o) => o.id === into);
  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Merge into another person</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-muted">
          For duplicates, e.g. from the import. Their roster places, point-person roles, usual programs and dates move to the person you keep. Then {name} is deleted, with their sign-in. Only for people who have never signed in, with no hours, pay or documentation.
        </p>
        <label className="flex flex-col gap-1">
          <span>Keep</span>
          <select value={into} onChange={(e) => { setInto(e.target.value); setMsg(null); }} aria-label="Person to keep" className={inputClass}>
            <option value="">Choose a person...</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
          </select>
        </label>
        <ConfirmButton
          disabled={pending || !keep}
          className="self-start rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60"
          label={pending ? "Merging..." : "Merge"}
          question={keep ? `Move everything of ${name} to ${keep.name}, then delete ${name}? This can't be undone.` : ""}
          confirmLabel="Yes, merge"
          onConfirm={() =>
            start(async () => {
              const r = await mergePerson(id, into);
              if (r?.message) setMsg(r.message);
            })
          }
        />
        {msg && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{msg}</p>}
      </div>
    </details>
  );
}
