"use client";

import { useActionState } from "react";
import { buttonClass, FormError } from "@/components/auth-card";
import type { Person } from "@/shared/domain/person";
import { setActive, updatePerson, type PersonFormState } from "../actions";
import { PersonFields } from "../person-fields";

const initial: PersonFormState = { status: "idle" };

export function EditPersonForm({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const [state, action, pending] = useActionState(updatePerson.bind(null, person.id), initial);
  const [activeState, activeAction, toggling] = useActionState(
    setActive.bind(null, person.id, !person.active),
    initial,
  );

  return (
    <div className="flex flex-col gap-10">
      <form action={action} className="flex flex-col gap-4">
        <PersonFields person={person} errors={state.errors} />
        <FormError message={state.message} />
        <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
          {pending ? "Saving..." : "Save changes"}
        </button>
      </form>

      <section className="rounded-xl border border-border p-5">
        <h2 className="font-semibold">{person.active ? "Deactivate" : "Reactivate"}</h2>
        <p className="mt-1 text-sm text-muted">
          {person.active
            ? "They'll be logged out of everything and can't log back in. Their past sessions, notes and invoices stay in the app."
            : "They'll be able to log in again with their existing password."}
        </p>
        {isSelf ? (
          <p className="mt-3 text-sm text-muted">You can&apos;t deactivate yourself. Ask another admin.</p>
        ) : (
          <form
            action={activeAction}
            className="mt-4"
            onSubmit={(e) => {
              if (person.active && !confirm(`Deactivate ${person.name}? They won't be able to log in.`)) {
                e.preventDefault();
              }
            }}
          >
            <FormError message={activeState.message} />
            <button
              type="submit"
              disabled={toggling}
              className={
                person.active
                  ? "rounded-full border border-red-600 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-950"
                  : `${buttonClass} text-sm`
              }
            >
              {toggling ? "Working..." : person.active ? `Deactivate ${person.name}` : `Reactivate ${person.name}`}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
