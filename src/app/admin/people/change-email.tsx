"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { changeEmail } from "./actions";

/** Change the sign-in email of someone who hasn't signed in yet (v0.32). */
export function ChangeEmail({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft">
          Change email
        </button>
        {msg && <span role="status" className={`text-xs ${msg.ok ? "text-iris" : "text-red-700 dark:text-red-400"}`}>{msg.text}</span>}
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changeEmail(id, value);
          setMsg({ ok: r.status !== "error", text: r.message ?? "" });
          if (r.status !== "error") setOpen(false);
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">New email</span>
        <input type="email" required value={value} onChange={(e) => setValue(e.target.value)} aria-label="New email" className={inputClass} />
        <span className="text-xs text-muted">Only before they&apos;ve signed in. This is the address they&apos;ll sign in with and where the invite goes.</span>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-full border border-border bg-iris-soft px-3 py-1 text-xs disabled:opacity-60">
          {pending ? "Saving..." : "Save email"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setValue(email); }} className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
      {msg && !msg.ok && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{msg.text}</p>}
    </form>
  );
}
