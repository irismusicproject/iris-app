"use client";

import { useActionState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import {
  RESIDENCY_STATUS_LABELS,
  RESIDENCY_STATUSES,
  SEASON_KIND_LABELS,
  SEASON_KINDS,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type Residency,
} from "@/shared/domain/scheduling";
import {
  addResidency,
  addResidencySite,
  addRosterMember,
  addSeason,
  addStaffAssignment,
  endStaffAssignment,
  updateResidency,
  updateRosterMember,
  type SetupFormState,
} from "./actions";

const initial: SetupFormState = { status: "idle" };
const smallButton = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";

function Status({ state, saving, saved = "Saved." }: { state: SetupFormState; saving?: boolean; saved?: string }) {
  if (saving) return null;
  if (state.status === "saved") return <p role="status" className="text-sm text-iris">{saved}</p>;
  return <FormError message={state.message} />;
}

type Option = { id: string; label: string };

// ---- Program (Residency) ----

export function ResidencyForm({ residency, partners }: { residency?: Residency; partners?: Option[] }) {
  const [state, action, pending] = useActionState(
    residency ? updateResidency.bind(null, residency.id, residency.partner_id) : addResidency,
    initial,
  );
  const e = state.errors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {!residency && (
          <Field label="Partner" error={e?.partner_id}>
            <select name="partner_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>Pick a partner</option>
              {partners?.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name" hint="Internal, e.g. “Revitz House”." error={e?.name}>
          <input name="name" required defaultValue={residency?.name} className={inputClass} />
        </Field>
        <Field
          label="Name on partner documents"
          hint="Leave blank for “Iris Music Project at [name]”."
          error={e?.display_name}
        >
          <input name="display_name" defaultValue={residency?.display_name} className={inputClass} />
        </Field>
        <Field label="Status" error={e?.status}>
          <select name="status" defaultValue={residency?.status ?? "planned"} className={inputClass}>
            {RESIDENCY_STATUSES.map((s) => <option key={s} value={s}>{RESIDENCY_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Started (optional)" error={e?.started_on}>
          <input name="started_on" type="date" defaultValue={residency?.started_on ?? ""} className={inputClass} />
        </Field>
        <Field label="Ended (optional)" error={e?.ended_on}>
          <input name="ended_on" type="date" defaultValue={residency?.ended_on ?? ""} className={inputClass} />
        </Field>
      </div>
      <Status state={state} saving={pending} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : residency ? "Save program" : "Add program"}
      </button>
    </form>
  );
}

// ---- Sites ----

export function AddSiteForm({ residencyId, sites }: { residencyId: string; sites: Option[] }) {
  const [state, action, pending] = useActionState(addResidencySite.bind(null, residencyId), initial);
  if (!sites.length) return <p className="text-sm text-muted">All of this partner&apos;s sites are already part of the program.</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Add a site" error={state.errors?.site_id}>
        <select name="site_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>Pick a site</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Adding..." : "Add site"}</button>
      <div className="w-full"><Status state={state} saving={pending} saved="Site added." /></div>
    </form>
  );
}

// ---- Seasons ----

export function AddSeasonForm({ residencyId }: { residencyId: string }) {
  const [state, action, pending] = useActionState(addSeason.bind(null, residencyId), initial);
  const e = state.errors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="e.g. “Spring 2027”." error={e?.name}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label="Kind" error={e?.kind}>
          <select name="kind" defaultValue="semester" className={inputClass}>
            {SEASON_KINDS.map((k) => <option key={k} value={k}>{SEASON_KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Starts" error={e?.starts_on}>
          <input name="starts_on" type="date" required className={inputClass} />
        </Field>
        <Field label="Ends" error={e?.ends_on}>
          <input name="ends_on" type="date" required className={inputClass} />
        </Field>
      </div>
      <Status state={state} saving={pending} saved="Season added." />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Adding..." : "Add season"}
      </button>
    </form>
  );
}

// ---- Roster ----

export function AddRosterMemberForm({ residencyId, seasonId, people }: { residencyId: string; seasonId: string; people: Option[] }) {
  const [state, action, pending] = useActionState(addRosterMember.bind(null, residencyId, seasonId), initial);
  if (!people.length) return <p className="text-sm text-muted">Everyone active is already on this roster.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add a musician" error={state.errors?.person_id}>
          <select name="person_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Pick a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_core" defaultChecked /> Core ensemble
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_admin_lead" /> Admin lead
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Adding..." : "Add to roster"}</button>
      </div>
      <Status state={state} saving={pending} saved="Added to the roster." />
    </form>
  );
}

export function RosterMemberActions({
  residencyId,
  memberId,
  name,
  isCore,
  isAdminLead,
}: {
  residencyId: string;
  memberId: string;
  name: string;
  isCore: boolean;
  isAdminLead: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (change: Parameters<typeof updateRosterMember>[2]) =>
    start(async () => {
      const r = await updateRosterMember(residencyId, memberId, change);
      if (r.status === "error") alert(r.message);
    });
  return (
    <span className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} className={smallButton} onClick={() => run({ is_core: !isCore })}>
        {isCore ? "Make occasional" : "Make core"}
      </button>
      <button type="button" disabled={pending} className={smallButton} onClick={() => run({ is_admin_lead: !isAdminLead })}>
        {isAdminLead ? "Remove admin lead" : "Make admin lead"}
      </button>
      <button
        type="button"
        disabled={pending}
        className={smallButton}
        aria-label={`Remove ${name} from the roster`}
        onClick={() => {
          if (confirm(`Remove ${name} from this roster as of today? Their past sessions stay in the record.`)) run({ leave: true });
        }}
      >
        Remove
      </button>
    </span>
  );
}

// ---- Iris staff (point person) ----

export function AddStaffForm({ residencyId, people }: { residencyId: string; people: Option[] }) {
  const [state, action, pending] = useActionState(addStaffAssignment.bind(null, residencyId), initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Iris staff member" error={state.errors?.person_id}>
          <select name="person_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Pick a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Role" error={state.errors?.role}>
          <select name="role" defaultValue="point_person" className={inputClass}>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving..." : "Assign"}</button>
      </div>
      <p className="text-xs text-muted">A new point person replaces the current one.</p>
      <Status state={state} saving={pending} saved="Assigned." />
    </form>
  );
}

export function EndStaffButton({ residencyId, assignmentId, name }: { residencyId: string; assignmentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={smallButton}
      aria-label={`End ${name}'s assignment`}
      onClick={() =>
        start(async () => {
          const r = await endStaffAssignment(residencyId, assignmentId);
          if (r.status === "error") alert(r.message);
        })
      }
    >
      End
    </button>
  );
}
