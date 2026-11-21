"use client";

import { useActionState } from "react";
import { buttonClass, FormError } from "@/components/auth-card";
import { addPerson, type PersonFormState } from "./actions";
import { PersonFields } from "./person-fields";

const initial: PersonFormState = { status: "idle" };

export function AddPersonForm() {
  const [state, action, pending] = useActionState(addPerson, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <PersonFields errors={state.errors} includeEmail />
      <FormError message={state.message} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Sending invite..." : "Add and send invite"}
      </button>
    </form>
  );
}
