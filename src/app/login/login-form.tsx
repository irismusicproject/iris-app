"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-xl bg-iris-soft p-4 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-muted">{state.message}</p>
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
          placeholder="you@irismusicproject.com"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base font-normal outline-none focus:border-iris focus:ring-2 focus:ring-iris/30"
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-iris px-6 py-3 font-medium text-white hover:bg-iris-strong disabled:opacity-60 dark:text-background"
      >
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}
