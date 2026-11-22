import { Field } from "@/components/app-shell";
import { inputClass } from "@/components/auth-card";
import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES, type Person } from "@/shared/domain/person";

export function PersonFields({
  person,
  errors,
  includeEmail,
}: {
  person?: Person;
  errors?: Record<string, string>;
  includeEmail?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" error={errors?.name}>
        <input name="name" required defaultValue={person?.name} autoComplete="off" className={inputClass} />
      </Field>
      {includeEmail ? (
        <Field label="Email" hint="Their sign-in. The invite goes here (now or later)." error={errors?.email}>
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
      ) : (
        <Field label="Email" hint="Email is their sign-in and can't be changed here.">
          <input value={person?.email} readOnly disabled className={`${inputClass} opacity-70`} />
        </Field>
      )}
      <Field label="Employment type" error={errors?.employment_type}>
        <select name="employment_type" required defaultValue={person?.employment_type ?? ""} className={inputClass}>
          <option value="" disabled>Choose…</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      <Field label="Job title" hint="Display only. Doesn't grant permissions." error={errors?.job_title}>
        <input name="job_title" defaultValue={person?.job_title ?? ""} className={inputClass} />
      </Field>
      <Field label="Phone" error={errors?.phone}>
        <input name="phone" type="tel" defaultValue={person?.phone ?? ""} className={inputClass} />
      </Field>
      <Field label="Instruments" hint="Separate with commas." error={errors?.instruments}>
        <input name="instruments" defaultValue={person?.instruments.join(", ")} className={inputClass} />
      </Field>
      <Field label="Creative Aging certification date" hint="Leave blank if not certified." error={errors?.certified_on}>
        <input name="certified_on" type="date" defaultValue={person?.certified_on ?? ""} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
        <input
          type="checkbox"
          name="is_admin"
          defaultChecked={person?.system_roles.includes("admin")}
          className="size-4 accent-[var(--iris)]"
        />
        Admin (can manage people and everything else)
      </label>
    </div>
  );
}
