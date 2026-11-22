"use client";

import { useActionState, useState } from "react";
import { buttonClass, FormError } from "@/components/auth-card";
import { addPerson, type PersonFormState } from "./actions";
import { PersonFields } from "./person-fields";

const initial: PersonFormState = { status: "idle" };

export function AddPersonForm() {
  const [state, action, pending] = useActionState(addPerson, initial);
  const [invite, setInvite] = useState(true);
  return (
    <form action={action} className="flex flex-col gap-4">
      <PersonFields errors={state.errors} includeEmail />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="send_invite" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="mt-1" />
        <span>
          Send the invite email now
          <span className="block text-xs text-muted">Untick to add them quietly, e.g. to set up rosters and schedules first. Invite them later from their page.</span>
        </span>
      </label>
      <FormError message={state.message} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Adding..." : invite ? "Add and send invite" : "Add without invite"}
      </button>
    </form>
  );
}
