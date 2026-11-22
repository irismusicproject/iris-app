// Person: anyone who signs in. Mirrors public.person in
// supabase/migrations and docs/DOMAIN-MODEL.md. Native apps can import this.

export const EMPLOYMENT_TYPES = ["contractor_1099", "employee_w2", "volunteer"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  contractor_1099: "Contractor (1099)",
  employee_w2: "Employee (W-2)",
  volunteer: "Volunteer",
};

export const SYSTEM_ROLES = ["admin"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  employment_type: EmploymentType;
  instruments: string[];
  system_roles: SystemRole[];
  job_title: string | null;
  active: boolean;
  certified_on: string | null; // ISO date
  /** When the invite was last sent; null = added but not invited yet (v0.29). */
  invited_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Fields a person may change on their own record. Enforced in the database too. */
export const SELF_EDITABLE_FIELDS = ["phone", "instruments"] as const;

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function parseInstruments(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .filter((s) => (seen.has(s.toLowerCase()) ? false : (seen.add(s.toLowerCase()), true)));
}

function clean(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export type SelfEdit = Pick<Person, "phone" | "instruments">;

export function validateSelfEdit(form: FormData): Result<SelfEdit> {
  const errors: Record<string, string> = {};
  const phone = clean(form.get("phone"));
  if (phone.length > 40) errors.phone = "Use 40 characters or fewer.";
  const instruments = parseInstruments(clean(form.get("instruments")));
  if (instruments.length > 20) errors.instruments = "List 20 instruments or fewer.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { phone: phone || null, instruments } };
}

export type AdminEdit = Pick<
  Person,
  "name" | "phone" | "employment_type" | "instruments" | "system_roles" | "job_title" | "certified_on"
>;

export function validateAdminEdit(form: FormData): Result<AdminEdit> {
  const self = validateSelfEdit(form);
  const errors: Record<string, string> = self.ok ? {} : { ...self.errors };

  const name = clean(form.get("name"));
  if (!name) errors.name = "Enter a name.";
  else if (name.length > 200) errors.name = "Use 200 characters or fewer.";

  const employment = clean(form.get("employment_type"));
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(employment)) {
    errors.employment_type = "Choose an employment type.";
  }

  const jobTitle = clean(form.get("job_title"));
  if (jobTitle.length > 200) errors.job_title = "Use 200 characters or fewer.";

  const certified = clean(form.get("certified_on"));
  if (certified && !/^\d{4}-\d{2}-\d{2}$/.test(certified)) {
    errors.certified_on = "Use a date like 2026-09-15.";
  }

  if (Object.keys(errors).length || !self.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...self.value,
      name,
      employment_type: employment as EmploymentType,
      system_roles: form.get("is_admin") === "on" ? ["admin"] : [],
      job_title: jobTitle || null,
      certified_on: certified || null,
    },
  };
}

export type NewPerson = AdminEdit & { email: string };

export function validateNewPerson(form: FormData): Result<NewPerson> {
  const base = validateAdminEdit(form);
  const errors: Record<string, string> = base.ok ? {} : { ...base.errors };
  const email = clean(form.get("email")).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (Object.keys(errors).length || !base.ok) return { ok: false, errors };
  return { ok: true, value: { ...base.value, email } };
}
