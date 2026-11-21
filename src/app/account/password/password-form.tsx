"use client";

import { useActionState } from "react";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/password";
import { setPassword, type SetPasswordState } from "./actions";

const initial: SetPasswordState = { status: "idle" };

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(setPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Lets password managers save the new password under the right account. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <label className="flex flex-col gap-2 text-sm font-medium">
        New password
        <input
          type="password"
          name="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          aria-describedby="password-hint"
          className={inputClass}
        />
        <span id="password-hint" className="text-xs font-normal text-muted">
          At least {PASSWORD_MIN_LENGTH} characters. A short phrase is easy to
          remember, like &ldquo;cello tuesday 42&rdquo;.
        </span>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Type it again
        <input
          type="password"
          name="confirm"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>
      <FormError message={state.message} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
