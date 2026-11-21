"use client";

import { useActionState } from "react";
import { Field } from "@/components/app-shell";
import { buttonClass, FormError, inputClass } from "@/components/auth-card";
import {
  CARE_LEVEL_LABELS,
  CARE_LEVELS,
  SITE_TIMEZONES,
  type Location,
  type Partner,
  type Site,
} from "@/shared/domain/place";
import {
  addLocation,
  addPartner,
  addSite,
  updateLocation,
  updatePartner,
  updateSite,
  type PlaceFormState,
} from "./actions";

const initial: PlaceFormState = { status: "idle" };

function Status({ state, saving }: { state: PlaceFormState; saving?: boolean }) {
  if (saving) return null;
  if (state.status === "saved") return <p role="status" className="text-sm text-iris">Saved.</p>;
  return <FormError message={state.message} />;
}

function ActiveSelect({ active }: { active: boolean }) {
  return (
    <Field label="Status" hint="Retired items stay in history but can't be picked for new work.">
      <select name="active" defaultValue={active ? "on" : "off"} className={inputClass}>
        <option value="on">Active</option>
        <option value="off">Retired</option>
      </select>
    </Field>
  );
}

// ---- Partner ----

export function PartnerForm({ partner }: { partner?: Partner }) {
  const [state, action, pending] = useActionState(
    partner ? updatePartner.bind(null, partner.id) : addPartner,
    initial,
  );
  const e = state.errors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal name" hint="As on contracts and invoices." error={e?.legal_name}>
          <input name="legal_name" required defaultValue={partner?.legal_name} className={inputClass} />
        </Field>
        <Field label="Display name" hint="As printed on calendars. Leave blank to use the legal name." error={e?.display_name}>
          <input name="display_name" defaultValue={partner?.display_name} className={inputClass} />
        </Field>
        <Field label="Billing email (optional)" error={e?.billing_email}>
          <input name="billing_email" type="email" defaultValue={partner?.billing_email ?? ""} className={inputClass} />
        </Field>
        <Field label="Billing address (optional)" error={e?.billing_address}>
          <textarea name="billing_address" rows={2} defaultValue={partner?.billing_address ?? ""} className={inputClass} />
        </Field>
        {partner && <ActiveSelect active={partner.active} />}
      </div>
      <Status state={state} saving={pending} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : partner ? "Save partner" : "Add partner"}
      </button>
    </form>
  );
}

// ---- Site ----

type Option = { id: string; label: string };

export function SiteForm({
  partnerId,
  site,
  partners,
}: {
  partnerId: string;
  site?: Site;
  /** When editing: partners this site can be moved to. */
  partners?: Option[];
}) {
  const [state, action, pending] = useActionState(
    site ? updateSite.bind(null, site.id) : addSite.bind(null, partnerId),
    initial,
  );
  const e = state.errors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="The building or campus, e.g. a house name." error={e?.name}>
          <input name="name" required defaultValue={site?.name} className={inputClass} />
        </Field>
        <Field label="Display name" hint="As printed on calendars. Leave blank to use the name." error={e?.display_name}>
          <input name="display_name" defaultValue={site?.display_name} className={inputClass} />
        </Field>
        <Field label="Street address" error={e?.address}>
          <input name="address" defaultValue={site?.address ?? ""} autoComplete="off" className={inputClass} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="City" error={e?.city}>
            <input name="city" defaultValue={site?.city ?? ""} className={inputClass} />
          </Field>
          <Field label="State" error={e?.state}>
            <input name="state" defaultValue={site?.state ?? ""} maxLength={50} className={inputClass} />
          </Field>
        </div>
        <Field label="Time zone" error={e?.timezone}>
          <select name="timezone" defaultValue={site?.timezone ?? "America/New_York"} className={inputClass}>
            {SITE_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
            {site && !SITE_TIMEZONES.some((tz) => tz.value === site.timezone) && (
              <option value={site.timezone}>{site.timezone}</option>
            )}
          </select>
        </Field>
        {site && <ActiveSelect active={site.active} />}
        {site && partners && partners.length > 1 && (
          <Field label="Partner" hint="Move this site to another partner if it was filed under the wrong one.">
            <select name="partner_id" defaultValue={partnerId} className={inputClass}>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Care levels</legend>
        <p className="text-xs text-muted">Check every level this site offers.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CARE_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="care_levels"
                value={level}
                defaultChecked={site?.care_levels.includes(level)}
                className="size-4 accent-[var(--iris)]"
              />
              {CARE_LEVEL_LABELS[level]}
            </label>
          ))}
        </div>
      </fieldset>
      <Status state={state} saving={pending} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving..." : site ? "Save site" : "Add site"}
      </button>
    </form>
  );
}

// ---- Location ----

export function AddLocationForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(addLocation.bind(null, siteId), initial);
  return (
    <form
      action={action}
      key={state.savedAt ?? 0}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <Field label="Room or area" error={state.errors?.name}>
        <input name="name" required placeholder="e.g. Auditorium" className={inputClass} />
      </Field>
      <Field label="Display name (optional)" error={state.errors?.display_name}>
        <input name="display_name" className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={`${buttonClass} text-sm`}>
        {pending ? "Adding..." : "Add location"}
      </button>
      <div className="sm:col-span-3"><Status state={state} saving={pending} /></div>
    </form>
  );
}

export function LocationRow({ location, sites }: { location: Location; sites: Option[] }) {
  const [state, action, pending] = useActionState(
    updateLocation.bind(null, location.id, location.site_id),
    initial,
  );
  return (
    <form
      action={action}
      className={`grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_8rem_10rem_auto] sm:items-end ${location.active ? "" : "opacity-70"}`}
    >
      <Field label="Room or area" error={state.errors?.name}>
        <input name="name" required defaultValue={location.name} className={inputClass} />
      </Field>
      <Field label="Display name" error={state.errors?.display_name}>
        <input name="display_name" defaultValue={location.display_name} className={inputClass} />
      </Field>
      <Field label="Status">
        <select name="active" defaultValue={location.active ? "on" : "off"} className={inputClass}>
          <option value="on">Active</option>
          <option value="off">Retired</option>
        </select>
      </Field>
      <Field label="Site">
        <select name="site_id" defaultValue={location.site_id} className={inputClass}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-4 py-2.5 text-sm hover:bg-iris-soft disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      <div className="sm:col-span-5"><Status state={state} saving={pending} /></div>
    </form>
  );
}
