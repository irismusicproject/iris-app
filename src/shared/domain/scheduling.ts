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
  title: string;
  default_location_id: string;
  weekdays: number[];
  start_time: string;
  minutes: number;
  active_from: string;
  active_until: string | null;
};

export type Session = {
  id: string;
  residency_id: string;
  series_id: string | null;
  title: string;
  location_id: string;
  starts_at: string;
  scheduled_minutes: number;
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
  title: string;
  default_location_id: string;
  weekdays: number[];
  start_time: string;
  minutes: number;
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
  if (input.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.weekdays = "Pick valid days.";
  if (!/^\d{2}:\d{2}$/.test(input.start_time)) errors.start_time = "Enter a start time.";
  if (!Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 600)
    errors.minutes = "Length must be between 5 and 600 minutes.";
  if (!input.active_from) errors.active_from = "Enter a start date.";
  if (input.active_until && input.active_from && input.active_until < input.active_from)
    errors.active_until = "The end date must be after the start date.";
  return errors;
}

/** A session needs exactly one playing leader before its month is published. */
export function playingLeaders(assignments: Pick<SessionAssignment, "role" | "status">[]): number {
  return assignments.filter((a) => a.role === "leader" && a.status !== "absent").length;
}
