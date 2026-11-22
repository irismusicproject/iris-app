// The monthly partner calendar (docs/GLOSSARY.md, Part B): what prints, in
// what order. Pure functions, so the PDF, the screens and native apps agree.

import { CANCELED_FOR_ABSENCE_CALENDAR_TEXT } from "./scheduling";
import { formatDay, formatTime } from "./time";

export type CalendarSessionInput = {
  id: string;
  series_id: string | null;
  series: { title: string; weekdays: number[]; start_time: string | null } | null;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  is_special_event: boolean;
  schedule_state: "draft" | "published" | "canceled";
  public_note: string | null;
  /** Who plays: first names, already ordered leader first, absent musicians left out. */
  musicians: string[];
};

export type CalendarRow = { day: string; time: string; title: string; musicians: string; note: string | null };
export type CalendarSection = { heading: "Special events" | "Regular programming"; blocks: CalendarRow[][] };

/** "with Ana", "with Ana and Ben", "with Ana, Ben, Cara" (as on Iris's calendars). */
export function withMusicians(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return ` with ${names[0]}`;
  if (names.length === 2) return ` with ${names[0]} and ${names[1]}`;
  return ` with ${names.join(", ")}`;
}

function row(s: CalendarSessionInput, timeZone: string, withWeekday: boolean): CalendarRow {
  const canceled = s.schedule_state === "canceled";
  return {
    day: formatDay(s.starts_at, timeZone, withWeekday),
    time: s.has_set_time ? formatTime(s.starts_at, timeZone) : "",
    title: canceled ? CANCELED_FOR_ABSENCE_CALENDAR_TEXT : `${s.title}${withMusicians(s.musicians)}`,
    musicians: canceled ? "" : s.musicians.join(", "),
    note: canceled ? null : s.public_note,
  };
}

/**
 * Only published and canceled sessions print (drafts never do). Every
 * canceled date prints "No Program". Special events first; then one block
 * per weekly program (by weekday, then time); then other one-time programs.
 */
export function buildCalendar(sessions: CalendarSessionInput[], timeZone: string): CalendarSection[] {
  const printable = sessions
    .filter((s) => s.schedule_state !== "draft")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const special = printable.filter((s) => s.is_special_event);
  const bySeries = new Map<string, CalendarSessionInput[]>();
  for (const s of printable.filter((x) => !x.is_special_event && x.series_id))
    bySeries.set(s.series_id!, [...(bySeries.get(s.series_id!) ?? []), s]);
  const blocks = [...bySeries.values()].sort((a, b) => {
    const wa = Math.min(...(a[0].series?.weekdays ?? [9])), wb = Math.min(...(b[0].series?.weekdays ?? [9]));
    return wa - wb || (a[0].series?.start_time ?? "99").localeCompare(b[0].series?.start_time ?? "99");
  });
  const others = printable.filter((s) => !s.is_special_event && !s.series_id);

  const sections: CalendarSection[] = [];
  if (special.length) sections.push({ heading: "Special events", blocks: [special.map((s) => row(s, timeZone, false))] });
  const regular = [...blocks.map((b) => b.map((s) => row(s, timeZone, true))), ...(others.length ? [others.map((s) => row(s, timeZone, true))] : [])];
  if (regular.length) sections.push({ heading: "Regular programming", blocks: regular });
  return sections;
}
