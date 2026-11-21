// Partner, Site, Location. Mirrors supabase/migrations and
// docs/DOMAIN-MODEL.md section 1. Native apps can import this.

export const CARE_LEVELS = [
  "independent", "assisted", "memory_care", "skilled_nursing",
  "adult_day", "affordable_housing", "other",
] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  independent: "Independent living",
  assisted: "Assisted living",
  memory_care: "Memory care",
  skilled_nursing: "Skilled nursing",
  adult_day: "Adult day",
  affordable_housing: "Affordable housing",
  other: "Other",
};

/** Time zones Iris sites use today. The database accepts any real time zone. */
export const SITE_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific" },
];

export type Partner = {
  id: string;
  legal_name: string;
  display_name: string;
  billing_address: string | null;
  billing_email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Site = {
  id: string;
  partner_id: string;
  name: string;
  display_name: string;
  care_levels: CareLevel[];
  address: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  site_id: string;
  name: string;
  display_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };
type Errors = Record<string, string>;

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function required(f: FormData, k: string, label: string, max: number, e: Errors) {
  const v = text(f, k);
  if (!v) e[k] = `Enter ${label}.`;
  else if (v.length > max) e[k] = `Use ${max} characters or fewer.`;
  return v;
}

function optional(f: FormData, k: string, max: number, e: Errors) {
  const v = text(f, k);
  if (v.length > max) e[k] = `Use ${max} characters or fewer.`;
  return v || null;
}

/** Display name falls back to the name when left blank. */
function displayName(f: FormData, name: string, e: Errors) {
  const v = text(f, "display_name") || name;
  if (v.length > 200) e.display_name = "Use 200 characters or fewer.";
  return v;
}

const active = (f: FormData) => f.get("active") !== "off";

export type PartnerInput = Omit<Partner, "id" | "created_at" | "updated_at">;

export function validatePartner(f: FormData): Result<PartnerInput> {
  const e: Errors = {};
  const legal_name = required(f, "legal_name", "the legal name", 200, e);
  const display_name = displayName(f, legal_name, e);
  const billing_address = optional(f, "billing_address", 500, e);
  const billing_email = optional(f, "billing_email", 200, e)?.toLowerCase() ?? null;
  if (billing_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing_email)) {
    e.billing_email = "Enter a valid email address, or leave it blank.";
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { legal_name, display_name, billing_address, billing_email, active: active(f) } };
}

export type SiteInput = Omit<Site, "id" | "partner_id" | "created_at" | "updated_at">;

export function validateSite(f: FormData): Result<SiteInput> {
  const e: Errors = {};
  const name = required(f, "name", "a name", 200, e);
  const display_name = displayName(f, name, e);
  const care_levels = f
    .getAll("care_levels")
    .map(String)
    .filter((v): v is CareLevel => (CARE_LEVELS as readonly string[]).includes(v));
  const address = optional(f, "address", 300, e);
  const city = optional(f, "city", 100, e);
  const state = optional(f, "state", 50, e);
  const timezone = text(f, "timezone") || "America/New_York";
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone)) e.timezone = "Choose a time zone.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: { name, display_name, care_levels, address, city, state, timezone, active: active(f) },
  };
}

export type LocationInput = Omit<Location, "id" | "site_id" | "created_at" | "updated_at">;

export function validateLocation(f: FormData): Result<LocationInput> {
  const e: Errors = {};
  const name = required(f, "name", "a name", 200, e);
  const display_name = displayName(f, name, e);
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { name, display_name, active: active(f) } };
}
