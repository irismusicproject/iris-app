"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { emailTypoHint, isEmail, normalizeEmail } from "@/shared/domain/email";
import { changeEmail } from "./actions";

/**
 * Change someone's sign-in email (v0.32). Guards against typos: the new
 * address is typed twice, likely domain typos are flagged, and the change is
 * confirmed with the old and new address side by side.
 */
export function ChangeEmail({ id, email, signedIn }: { id: string; email: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [again, setAgain] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const next = normalizeEmail(value);
  const valid = isEmail(next);
  const matches = valid && normalizeEmail(again) === next;
  const typo = valid ? emailTypoHint(next) : null;
  const reset = () => { setOpen(false); setValue(""); setAgain(""); setConfirming(false); };

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
      className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (matches && next !== email) setConfirming(true);
      }}
    >
      <p className="text-xs text-muted">
        Now: <span className="font-medium text-foreground">{email}</span>.{" "}
        {signedIn
          ? "They already use the app: they'll sign in with the new email and the same password, and both addresses get a notice."
          : "They haven't signed in yet: the invite goes to the new email."}
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">New email</span>
        <input type="email" required value={value} disabled={confirming} onChange={(e) => setValue(e.target.value)} aria-label="New email" autoComplete="off" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Type it again</span>
        <input
          type="email"
          required
          value={again}
          disabled={confirming}
          onChange={(e) => setAgain(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          aria-label="Type the new email again"
          autoComplete="off"
          className={inputClass}
        />
        {again && !matches && <span className="text-xs text-red-700 dark:text-red-400">The two don&apos;t match yet.</span>}
      </label>
      {typo && (
        <p className="text-xs text-brand-orange">
          Did you mean <button type="button" className="underline" onClick={() => { setValue(typo); setAgain(""); }}>{typo}</button>?
        </p>
      )}

      {!confirming ? (
        <div className="flex gap-2">
          <button type="submit" disabled={!matches || next === email} className="rounded-full border border-border bg-iris-soft px-3 py-1 text-xs disabled:opacity-60">
            Continue
          </button>
          <button type="button" onClick={reset} className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">Cancel</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-iris-soft p-3">
          <p>
            Change <span className="font-medium">{email}</span>
            <br />to <span className="font-medium">{next}</span>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await changeEmail(id, value, again);
                  setMsg({ ok: r.status !== "error", text: r.message ?? "" });
                  if (r.status !== "error") reset();
                  else setConfirming(false);
                })
              }
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs disabled:opacity-60"
            >
              {pending ? "Saving..." : "Yes, change it"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">
              Back
            </button>
          </div>
        </div>
      )}
      {msg && !msg.ok && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{msg.text}</p>}
    </form>
  );
}
