// Documentation: SessionReport, RelationshipActivity, Resident,
// MonthlyReflection (docs/DOMAIN-MODEL.md section 4, v0.14). Native apps can
// import this.

export const RESIDENT_INVOLVEMENTS = ["none", "co_facilitated", "co_led"] as const;
export type ResidentInvolvement = (typeof RESIDENT_INVOLVEMENTS)[number];
/** Shown as the workbook's "Collab?" (D6: co-facilitated or co-led = collaborative). */
export const RESIDENT_INVOLVEMENT_LABELS: Record<ResidentInvolvement, string> = {
  none: "No",
  co_facilitated: "Yes: co-facilitated",
  co_led: "Yes: co-led",
};

export const ACTIVITY_KINDS = ["one_to_one", "mini_group", "hallway_concert"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  one_to_one: "One-to-one",
  mini_group: "Mini-group session (2–8 residents)",
  hallway_concert: "Hallway concert",
};
/** Hallway concerts are played for whoever is there, so residents are optional (assumption, v0.14). */
export const residentsRequired = (kind: ActivityKind) => kind !== "hallway_concert";

/** Monday of the week containing a date ("YYYY-MM-DD"). Weeks run Monday–Sunday. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** "Nov 16 – 22, 2026" */
export function formatWeek(monday: string): string {
  const end = addDays(monday, 6);
  const f = (v: string, o: Intl.DateTimeFormatOptions) => new Date(`${v}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  const sameMonth = monday.slice(0, 7) === end.slice(0, 7);
  return `${f(monday, { month: "short", day: "numeric" })} – ${f(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}, ${end.slice(0, 4)}`;
}
/** Documentation and hours are due 5 pm Tuesday of the following week (D7). */
export function dueLabel(monday: string): string {
  const tue = addDays(monday, 8);
  return `${new Date(`${tue}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })}, 5 pm`;
}
