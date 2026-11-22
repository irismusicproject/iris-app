// Residency, Season, RosterMember, StaffAssignment, Series, Session,
// SessionAssignment, CalendarExport. Mirrors
// supabase/migrations/20261123120000_scheduling.sql and docs/DOMAIN-MODEL.md
// sections 2 and 3. Native apps can import this.
//
// Display words follow docs/GLOSSARY.md: a Residency is shown as "Program",
// a Series as a "Weekly program", a Session as a dated program.

export const RESIDENCY_STATUSES = ["planned", "active", "paused", "ended"] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

export const SEASON_KINDS = ["semester", "season", "summer_session", "other"] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];
export const SEASON_KIND_LABELS: Record<SeasonKind, string> = {
  semester: "Semester",
  season: "Season",
  summer_session: "Summer session",
  other: "Other",
};

export const STAFF_ROLES = ["point_person", "support"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  point_person: "Point person",
  support: "Support",
};

export const SCHEDULE_STATES = ["draft", "published", "canceled"] as const;
export type ScheduleState = (typeof SCHEDULE_STATES)[number];

export const CANCELLATION_REASONS = ["partner", "weather", "musician", "other"] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  partner: "Partner canceled",
  weather: "Weather",
  musician: "Musician absent (No Program)",
  other: "Other",
};

export const ASSIGNMENT_ROLES = ["leader", "participant"] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const ASSIGNMENT_STATUSES = ["assigned", "absent", "substitute"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** group_session: documented by its leader. relationship_building: e.g. weekly
 *  "Lessons"; time optional, no leader, documented as relationship-building
 *  activities (DOMAIN-MODEL v0.10). */
export const SESSION_KINDS = ["group_session", "relationship_building"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  group_session: "Group session",
  relationship_building: "Relationship building (e.g. lessons)",
};

export const CALENDAR_STATES = ["reviewed", "sent"] as const;
export type CalendarState = (typeof CALENDAR_STATES)[number];

/** ISO weekdays, 1 = Monday … 7 = Sunday (Series.weekdays). */
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

/** What a canceled session prints as on the partner calendar (D11). */
export const CANCELED_FOR_ABSENCE_CALENDAR_TEXT = "No Program";

export type Residency = {
  id: string;
  partner_id: string;
  name: string;
  display_name: string;
  status: ResidencyStatus;
  started_on: string | null;
  ended_on: string | null;
};

export type Season = {
  id: string;
  residency_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  kind: SeasonKind;
};

export type RosterMember = {
  id: string;
  season_id: string;
  person_id: string;
  is_core: boolean;
  is_admin_lead: boolean;
  joined_on: string;
  left_on: string | null;
};

export type StaffAssignment = {
  id: string;
  residency_id: string;
  person_id: string;
  role: StaffRole;
  starts_on: string;
  ends_on: string | null;
};

export type Series = {
  id: string;
  residency_id: string;
  kind: SessionKind;
  title: string;
  default_location_id: string;
  weekdays: number[];
  start_time: string | null;
  minutes: number | null;
  active_from: string;
  active_until: string | null;
  /** Usual leader: made leader on each date when a month is filled in (v0.15). */
  default_leader_id: string | null;
  /** weekly, or monthly on the Nth (1-4) weekday (v0.18). */
  recurrence: "weekly" | "monthly";
  week_of_month: number | null;
  /** Usual type: pre-selected when the leader documents (v0.21). */
  default_interaction_type_id: string | null;
};

export const WEEK_OF_MONTH_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

/** "Tuesdays", "Tuesdays and Thursdays", "4th Monday of each month" */
export function recurrenceLabel(s: Pick<Series, "recurrence" | "week_of_month" | "weekdays">): string {
  const days = WEEKDAYS.filter((d) => s.weekdays.includes(d.value)).map((d) => d.label);
  if (s.recurrence === "monthly") return `${WEEK_OF_MONTH_LABELS[s.week_of_month ?? 1]} ${days[0] ?? ""} of each month`;
  return days.map((d) => `${d}s`).join(", ");
}

export type Session = {
  id: string;
  residency_id: string;
  series_id: string | null;
  kind: SessionKind;
  title: string;
  location_id: string;
  starts_at: string;
  has_set_time: boolean;
  scheduled_minutes: number | null;
  call_time: string | null;
  is_special_event: boolean;
  is_extra: boolean;
  billable: boolean;
  schedule_state: ScheduleState;
  cancellation_reason: CancellationReason | null;
  canceled_at: string | null;
  public_note: string | null;
  internal_note: string | null;
};

export type SessionAssignment = {
  id: string;
  session_id: string;
  person_id: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  substitute_for_id: string | null;
};

export type CalendarExport = {
  id: string;
  residency_id: string;
  site_id: string;
  month: string;
  version: number;
  state: CalendarState;
  reviewed_by: string | null;
  reviewed_at: string | null;
  generated_by: string | null;
  generated_at: string | null;
  sent_at: string | null;
  partner_feedback: string | null;
};

// ---- Validation for forms (the database enforces the same rules) ----

export type SeriesInput = {
  recurrence: "weekly" | "monthly";
  week_of_month: number | null;
  kind: SessionKind;
  title: string;
  default_location_id: string;
  weekdays: number[];
  start_time: string | null;
  minutes: number | null;
  active_from: string;
  active_until?: string | null;
};

export function validateSeries(input: SeriesInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  if (!title) errors.title = "Enter a title.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";
  if (!input.default_location_id) errors.default_location_id = "Pick a room or area.";
  if (!input.weekdays.length) errors.weekdays = "Pick at least one day.";
  if (input.recurrence === "monthly") {
    if (input.weekdays.length !== 1) errors.weekdays = "Pick one day for a monthly program.";
    if (!input.week_of_month || input.week_of_month < 1 || input.week_of_month > 4) errors.week_of_month = "Pick which week (1st–4th).";
  }
  if (input.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.weekdays = "Pick valid days.";
  const timeOptional = input.kind === "relationship_building";
  if (input.start_time ? !/^\d{2}:\d{2}$/.test(input.start_time) : !timeOptional)
    errors.start_time = "Enter a start time.";
  if (input.minutes == null ? !timeOptional : !Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 600)
    errors.minutes = "Length must be between 5 and 600 minutes.";
  if (!input.active_from) errors.active_from = "Enter a start date.";
  if (input.active_until && input.active_from && input.active_until < input.active_from)
    errors.active_until = "The end date must be after the start date.";
  return errors;
}

/** A group session needs exactly one playing leader before its month is published. */
export function playingLeaders(assignments: Pick<SessionAssignment, "role" | "status">[]): number {
  return assignments.filter((a) => a.role === "leader" && a.status !== "absent").length;
}

// ---- Form validation for program setup (residency, season, roster, staff) ----
// Same shape as place.ts: FormData in, { ok, value } or { ok: false, errors } out.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };
type Errors = Record<string, string>;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function requiredText(f: FormData, k: string, label: string, e: Errors, max = 200) {
  const v = text(f, k);
  if (!v) e[k] = `Enter ${label}.`;
  else if (v.length > max) e[k] = `Use ${max} characters or fewer.`;
  return v;
}
function optionalDate(f: FormData, k: string, e: Errors) {
  const v = text(f, k);
  if (v && !isDate(v)) e[k] = "Enter a valid date.";
  return v || null;
}
function requiredDate(f: FormData, k: string, label: string, e: Errors) {
  const v = text(f, k);
  if (!isDate(v)) e[k] = `Enter ${label}.`;
  return v;
}
function requiredId(f: FormData, k: string, label: string, e: Errors) {
  const v = text(f, k);
  if (!isUuid(v)) e[k] = `Pick ${label}.`;
  return v;
}

export type ResidencyInput = Omit<Residency, "id">;

export function validateResidency(f: FormData, partnerId?: string): Result<ResidencyInput> {
  const e: Errors = {};
  const partner_id = partnerId ?? requiredId(f, "partner_id", "a partner", e);
  const name = requiredText(f, "name", "a name", e);
  const display_name = text(f, "display_name") || (name ? `Iris Music Project at ${name}` : "");
  if (display_name.length > 200) e.display_name = "Use 200 characters or fewer.";
  const status = (text(f, "status") || "planned") as ResidencyStatus;
  if (!RESIDENCY_STATUSES.includes(status)) e.status = "Pick a status.";
  const started_on = optionalDate(f, "started_on", e);
  const ended_on = optionalDate(f, "ended_on", e);
  if (started_on && ended_on && ended_on < started_on) e.ended_on = "The end date must be after the start date.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { partner_id, name, display_name, status, started_on, ended_on } };
}

export type SeasonInput = Omit<Season, "id" | "residency_id">;

export function validateSeason(f: FormData): Result<SeasonInput> {
  const e: Errors = {};
  const name = requiredText(f, "name", "a name, e.g. \"Spring 2027\"", e);
  const starts_on = requiredDate(f, "starts_on", "a start date", e);
  const ends_on = requiredDate(f, "ends_on", "an end date", e);
  if (isDate(starts_on) && isDate(ends_on) && ends_on < starts_on) e.ends_on = "The end date must be after the start date.";
  const kind = (text(f, "kind") || "season") as SeasonKind;
  if (!SEASON_KINDS.includes(kind)) e.kind = "Pick a kind.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { name, starts_on, ends_on, kind } };
}

export type RosterMemberInput = { person_id: string; is_core: boolean; is_admin_lead: boolean; joined_on: string };

export function validateRosterMember(f: FormData): Result<RosterMemberInput> {
  const e: Errors = {};
  const person_id = requiredId(f, "person_id", "a musician", e);
  const joined_on = text(f, "joined_on") || new Date().toISOString().slice(0, 10);
  if (!isDate(joined_on)) e.joined_on = "Enter a valid date.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: { person_id, is_core: f.get("is_core") === "on", is_admin_lead: f.get("is_admin_lead") === "on", joined_on },
  };
}

export type StaffAssignmentInput = { person_id: string; role: StaffRole; starts_on: string };

export function validateStaffAssignment(f: FormData): Result<StaffAssignmentInput> {
  const e: Errors = {};
  const person_id = requiredId(f, "person_id", "a staff member", e);
  const role = (text(f, "role") || "point_person") as StaffRole;
  if (!STAFF_ROLES.includes(role)) e.role = "Pick a role.";
  const starts_on = text(f, "starts_on") || new Date().toISOString().slice(0, 10);
  if (!isDate(starts_on)) e.starts_on = "Enter a valid date.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { person_id, role, starts_on } };
}

export const RESIDENCY_STATUS_LABELS: Record<ResidencyStatus, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};
