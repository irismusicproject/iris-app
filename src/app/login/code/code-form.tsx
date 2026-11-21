"use client";

import { useActionState } from "react";
import { buttonClass, FormError, inputClass, linkClass } from "@/components/auth-card";
import { sendSignInCode, verifySignInCode, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function CodeForm() {
  const [sendState, sendAction, sending] = useActionState(sendSignInCode, initial);
  const [verifyState, verifyAction, verifying] = useActionState(verifySignInCode, initial);

  if (sendState.status !== "sent") {
    return (
      <form action={sendAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email address
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            defaultValue={sendState.email}
            className={inputClass}
          />
        </label>
        <FormError message={sendState.status === "error" ? sendState.message : undefined} />
        <button type="submit" disabled={sending} className={buttonClass}>
          {sending ? "Sending..." : "Email me a code"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="rounded-lg bg-iris-soft p-3 text-sm">
        If <span className="font-medium">{sendState.email}</span> has an Iris
        account, we just emailed it a sign-in code.
      </p>
      <form action={verifyAction} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={sendState.email} />
        <label className="flex flex-col gap-2 text-sm font-medium">
          Code
          <input
            type="text"
            name="code"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9 ]*"
            maxLength={12}
            autoFocus
            className={`${inputClass} tracking-[0.3em]`}
          />
        </label>
        <FormError message={verifyState.message} />
        <button type="submit" disabled={verifying} className={buttonClass}>
          {verifying ? "Checking..." : "Log in"}
        </button>
      </form>
      <form action={sendAction}>
        <input type="hidden" name="email" value={sendState.email} />
        <button type="submit" disabled={sending} className={`text-sm ${linkClass}`}>
          {sending ? "Sending..." : "Send a new code"}
        </button>
      </form>
    </div>
  );
}
