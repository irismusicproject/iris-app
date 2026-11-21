"use client";

import { useActionState } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import type { Person } from "@/shared/domain/person";
import { saveProfile, type ProfileState } from "./actions";

const initial: ProfileState = { status: "idle" };

export function ProfileForm({ person }: { person: Person }) {
  const [state, action, pending] = useActionState(saveProfile, initial);
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <Field label="Phone" error={state.errors?.phone}>
        <input name="phone" type="tel" autoComplete="tel" defaultValue={person.phone ?? ""} className={inputClass} />
      </Field>
      <Field label="Instruments" hint="Separate with commas, e.g. violin, viola" error={state.errors?.instruments}>
        <input name="instruments" defaultValue={person.instruments.join(", ")} className={inputClass} />
      </Field>
      <FormError message={state.message} />
      {state.status === "saved" && (
        <p role="status" className="text-sm text-iris">Saved.</p>
      )}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
