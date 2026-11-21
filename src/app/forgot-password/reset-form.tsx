"use client";

import { useActionState } from "react";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { sendResetLink, type ResetState } from "./actions";

const initial: ResetState = { status: "idle" };

export function ResetForm() {
  const [state, action, pending] = useActionState(sendResetLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-lg bg-iris-soft p-4 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-muted">
          If {state.email} has an Iris account, we sent it a link to set a new
          password. The link works once.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Email address
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          defaultValue={state.email}
          className={inputClass}
        />
      </label>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Sending..." : "Email me a reset link"}
      </button>
    </form>
  );
}
