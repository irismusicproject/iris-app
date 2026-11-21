"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, FormError, inputClass, linkClass } from "@/components/auth-card";
import { signInWithPassword, type FormState } from "./actions";

const initial: FormState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signInWithPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Email address
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          inputMode="email"
          defaultValue={state.email}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        <span className="flex items-center justify-between">
          Password
          <Link href="/forgot-password" className={`text-sm ${linkClass}`}>
            Forgot password?
          </Link>
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
