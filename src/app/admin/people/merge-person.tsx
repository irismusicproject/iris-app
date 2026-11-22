"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { mergePerson } from "./actions";

type Other = { id: string; name: string; email: string };

/**
 * Merge another record of the same person into this one (v0.33). Everything
 * from both ends up here; the admin picks which email they sign in with.
 */
export function MergePerson({ id, name, email, others, isSelf }: { id: string; name: string; email: string; others: Other[]; isSelf: boolean }) {
  const [fromId, setFromId] = useState("");
  const [keep, setKeep] = useState<"into" | "from">("into");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const from = others.find((o) => o.id === fromId);
  const keptEmail = keep === "from" && from ? from.email : email;

  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Merge another record into {name}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted">
          For when the same person has two records, e.g. a wrong email in the import, or a new address set up as a new person.
          Everything from the other record moves here: programs and roles, dates, documentation, relationship building, hours and pay.
          Then the other record is deleted.
        </p>
        <label className="flex flex-col gap-1">
          <span>Other record</span>
          <select value={fromId} onChange={(e) => { setFromId(e.target.value); setKeep("into"); setConfirming(false); setMsg(null); }} aria-label="Other record" className={inputClass}>
            <option value="">Choose a person...</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
          </select>
        </label>
        {from && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">Sign-in email to keep</legend>
            <label className="flex items-center gap-2"><input type="radio" name="keep" checked={keep === "into"} onChange={() => setKeep("into")} /> {email}</label>
            <label className="flex items-center gap-2"><input type="radio" name="keep" checked={keep === "from"} onChange={() => setKeep("from")} /> {from.email}</label>
          </fieldset>
        )}
        {from && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="self-start rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">
            Continue
          </button>
        )}
        {from && confirming && (
          <div className="flex flex-col gap-2 rounded-lg bg-iris-soft p-3">
            <p>
              Move everything from <span className="font-medium">{from.name} ({from.email})</span> to <span className="font-medium">{name}</span>,
              then delete that record? They&apos;ll sign in with <span className="font-medium">{keptEmail}</span>.
            </p>
            <p className="text-xs">
              If {from.name}&apos;s record has ever been used to sign in, both old passwords stop working and a link to set a new one goes
              to {keptEmail}{isSelf ? " (you'd be signed out)" : ""}. Otherwise {name} keeps signing in with the same password. This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await mergePerson(from.id, id, keep);
                    if (r?.message) { setMsg(r.message); setConfirming(false); }
                  })
                }
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs disabled:opacity-60"
              >
                {pending ? "Merging..." : "Yes, merge"}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">Back</button>
            </div>
          </div>
        )}
        {msg && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{msg}</p>}
      </div>
    </details>
  );
}
