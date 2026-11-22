"use client";

import { useActionState, useState, useTransition } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
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
  addStipend,
  endStaffAssignment,
  removeStipend,
  setContractRate,
  setSiteDetailedNotes,
  retireSiteContact,
  saveSiteContact,
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
  if (!sites.length)
    return (
      <div className="flex flex-col gap-1">
        <Status state={state} saving={pending} saved="Site added." />
        <p className="text-sm text-muted">All of this partner&apos;s sites are part of the program.</p>
      </div>
    );
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
  if (!people.length)
    return (
      <div className="flex flex-col gap-1">
        <Status state={state} saving={pending} saved="Added to the roster." />
        <p className="text-sm text-muted">Everyone active is on this roster.</p>
      </div>
    );
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
      <ConfirmButton
        disabled={pending}
        className={smallButton}
        ariaLabel={`Remove ${name} from the roster`}
        label="Remove"
        question={`Remove ${name} as of today? Past sessions stay in the record.`}
        confirmLabel="Yes, remove"
        onConfirm={() => run({ leave: true })}
      />
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

// ---- Pay (admins only, v0.19): hourly rate and stipend payments ----

export type PayContract = {
  id: string;
  hourly_rate: number;
  stipend_installment: { id: string; kind: string; due_on: string; amount: number }[];
};
const STIPEND_KINDS = ["project_support", "admin_lead", "training", "other"];
const kindLabel = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function PayEditor({
  residencyId,
  seasonId,
  personId,
  name,
  contract,
}: {
  residencyId: string;
  seasonId: string;
  personId: string;
  name: string;
  contract: PayContract | null;
}) {
  const [rate, setRate] = useState(contract ? String(Number(contract.hourly_rate)) : "");
  const [kind, setKind] = useState("project_support");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<SetupFormState>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.status === "error" ? (r.message ?? "Something went wrong.") : ok);
      if (r.status !== "error") after?.();
    });
  const stipends = [...(contract?.stipend_installment ?? [])].sort((a, b) => a.due_on.localeCompare(b.due_on));
  return (
    <details className="w-full text-xs">
      <summary className="cursor-pointer text-iris">
        Pay: {contract ? `$${Number(contract.hourly_rate).toFixed(2)}/hr` : "rate not set"}
        {stipends.length > 0 && ` · ${stipends.length} stipend payment${stipends.length === 1 ? "" : "s"}`}
      </summary>
      <div className="mt-2 flex flex-col gap-3 rounded-lg bg-iris-soft/60 p-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setContractRate(residencyId, seasonId, personId, Number(rate)), "Rate saved.");
          }}
        >
          <label htmlFor={`rate-${personId}`}>Hourly rate $</label>
          <input id={`rate-${personId}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputClass} w-24 py-1 text-xs`} />
          <button disabled={pending} className={smallButton}>Save rate</button>
        </form>
        {contract ? (
          <div>
            <p className="font-medium">Stipend payments</p>
            <ul className="mt-1 space-y-1">
              {stipends.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  {kindLabel(s.kind)} · ${Number(s.amount).toFixed(2)} · due {s.due_on}
                  <ConfirmButton
                    label="Remove"
                    question="Remove this payment?"
                    className="text-muted underline"
                    onConfirm={() => run(() => removeStipend(residencyId, s.id), "Removed.")}
                  />
                </li>
              ))}
              {stipends.length === 0 && <li className="text-muted">None yet.</li>}
            </ul>
            <form
              className="mt-2 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => addStipend(residencyId, contract.id, kind, due, Number(amount)), "Stipend payment added.", () => {
                  setDue("");
                  setAmount("");
                });
              }}
            >
              <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={`Stipend kind for ${name}`} className={`${inputClass} py-1 text-xs`}>
                {STIPEND_KINDS.map((k) => (
                  <option key={k} value={k}>{kindLabel(k)}</option>
                ))}
              </select>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due on" className={`${inputClass} py-1 text-xs`} />
              <span>$</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" className={`${inputClass} w-24 py-1 text-xs`} />
              <button disabled={pending} className={smallButton}>Add payment</button>
            </form>
          </div>
        ) : (
          <p className="text-muted">Save a rate first, then add stipend payments.</p>
        )}
        <p className="text-muted">Only {name} and admins see this. Point people never see pay.</p>
        {msg && <p role="status" className="text-iris">{msg}</p>}
      </div>
    </details>
  );
}

// ---- Detailed one-to-one notes per site (v0.21) ----

export function SiteDetailedNotesToggle({ residencyId, siteId, on }: { residencyId: string; siteId: string; on: boolean }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(on);
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(async () => {
            const r = await setSiteDetailedNotes(residencyId, siteId, next);
            if (r.status === "error") setChecked(!next);
          });
        }}
      />
      Detailed one-to-one notes + daily Word document
    </label>
  );
}

export function DailyNotesDownload({ siteId, siteName, defaultDate }: { siteId: string; siteName: string; defaultDate: string }) {
  return (
    <form action={`/relationship-notes/${siteId}`} method="get" className="flex flex-wrap items-center gap-2 text-xs">
      <span>Word document for a day:</span>
      <input type="date" name="date" defaultValue={defaultDate} required aria-label={`Day for ${siteName}`} className={`${inputClass} py-1 text-xs`} />
      <button className={smallButton}>Download</button>
    </form>
  );
}

// ---- Community contacts per building (v0.26) ----

export type SiteContact = { id: string; name: string; title: string | null; email: string | null; phone: string | null };

function ContactForm({ residencyId, siteId, contact, onDone }: { residencyId: string; siteId: string; contact?: SiteContact; onDone: () => void }) {
  const [name, setName] = useState(contact?.name ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 rounded-lg bg-iris-soft/60 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSiteContact(residencyId, siteId, contact?.id ?? null, { name, title, email, phone });
          if (r.status === "error") setMsg(r.message ?? "Something went wrong.");
          else onDone();
        });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Name" aria-label="Contact name" className={`${inputClass} py-1.5 text-sm`} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Life Enrichment Director)" aria-label="Contact title" className={`${inputClass} py-1.5 text-sm`} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone" aria-label="Contact phone" className={`${inputClass} py-1.5 text-sm`} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" aria-label="Contact email" className={`${inputClass} py-1.5 text-sm`} />
      <div className="flex items-center gap-2 sm:col-span-2">
        <button disabled={pending} className={smallButton}>{pending ? "Saving..." : contact ? "Save contact" : "Add contact"}</button>
        <button type="button" className="text-xs text-muted underline" onClick={onDone}>Cancel</button>
        {msg && <span role="status" className="text-xs text-red-600">{msg}</span>}
      </div>
    </form>
  );
}

export function SiteContacts({ residencyId, siteId, contacts, canEdit }: { residencyId: string; siteId: string; contacts: SiteContact[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {contacts.map((c) =>
        editing === c.id ? (
          <ContactForm key={c.id} residencyId={residencyId} siteId={siteId} contact={c} onDone={() => setEditing(null)} />
        ) : (
          <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{c.name}</span>
            {c.title && <span className="text-muted">{c.title}</span>}
            {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-iris hover:underline">{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="text-iris hover:underline">{c.email}</a>}
            {canEdit && (
              <span className="flex items-center gap-2 text-xs">
                <button type="button" className="text-muted underline" onClick={() => setEditing(c.id)}>Edit</button>
                <ConfirmButton
                  disabled={pending}
                  label="Remove"
                  question={`Remove ${c.name}?`}
                  className="text-muted underline"
                  onConfirm={() => start(async () => { await retireSiteContact(residencyId, siteId, c.id); })}
                />
              </span>
            )}
          </div>
        ),
      )}
      {contacts.length === 0 && <span className="text-muted">No community contact yet.</span>}
      {canEdit && editing === "new" && <ContactForm residencyId={residencyId} siteId={siteId} onDone={() => setEditing(null)} />}
      {canEdit && editing === null && (
        <button type="button" className={`${smallButton} self-start`} onClick={() => setEditing("new")}>Add a community contact</button>
      )}
    </div>
  );
}
