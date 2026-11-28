// Iris Supervisor metrics (DOMAIN-MODEL v0.24): who is on track. Pure functions
// over a season's data, so web and native apps compute them the same way.
// Metrics are a starting set chosen by Lauren (Nov 22, 2026) and may change.

import { addDays, weekStart } from "./documentation";
import { zonedToUtc } from "./time";

export type MetricSession = {
  date: string; // local date at its building
  startsAt: string;
  canceled: boolean;
  siteId: string; // documented building, else the scheduled room's
  musicians: string[]; // not absent
  report: { attendance: number; collaborative: boolean } | null;
};
export type MetricActivity = { date: string; minutes: number; musicians: string[]; residentIds: string[] };
export type MetricEntry = { personId: string; week: string; submittedAt: string | null; state: string };

export type MusicianMetrics = {
  personId: string;
  collaborations: number;
  target: number;
  onTime: number;
  late: number;
  missing: number;
  rbMinutesPerWeek: number;
  residentsReached: number;
};
export type BuildingMetrics = { siteId: string; monthAvg: number | null; monthCount: number; seasonAvg: number | null; seasonCount: number };

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Documentation and hours for a week are due Tuesday 5 pm the following week (D7), in the program's time zone. */
export function weekDeadline(week: string, timeZone: string): string {
  return zonedToUtc(addDays(week, 8), "17:00", timeZone);
}

export function buildingMetrics(sessions: MetricSession[], siteIds: string[], month: string): BuildingMetrics[] {
  return siteIds.map((siteId) => {
    const done = sessions.filter((s) => !s.canceled && s.report && s.siteId === siteId);
    const inMonth = done.filter((s) => s.date.slice(0, 7) === month.slice(0, 7));
    return {
      siteId,
      monthAvg: avg(inMonth.map((s) => s.report!.attendance)),
      monthCount: inMonth.length,
      seasonAvg: avg(done.map((s) => s.report!.attendance)),
      seasonCount: done.length,
    };
  });
}

export function musicianMetrics(input: {
  musicians: string[];
  sessions: MetricSession[];
  activities: MetricActivity[];
  entries: MetricEntry[];
  target: number;
  seasonStart: string;
  today: string;
  now: string;
  timeZone: string;
}): MusicianMetrics[] {
  const { sessions, activities, entries, today, now, timeZone } = input;
  // Weeks of the season whose deadline has passed.
  const weeks: string[] = [];
  for (let w = weekStart(input.seasonStart); addDays(w, 6) < today; w = addDays(w, 7)) if (weekDeadline(w, timeZone) <= now) weeks.push(w);
  const elapsedWeeks = Math.max(1, Math.ceil((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${weekStart(input.seasonStart)}T12:00:00Z`)) / (7 * 86_400_000)));

  return input.musicians.map((pid) => {
    const played = sessions.filter((s) => !s.canceled && s.musicians.includes(pid));
    const mine = activities.filter((a) => a.musicians.includes(pid));
    let onTime = 0;
    let late = 0;
    let missing = 0;
    for (const w of weeks) {
      const end = addDays(w, 6);
      const hadWork = played.some((s) => s.date >= w && s.date <= end && s.startsAt <= now) || mine.some((a) => a.date >= w && a.date <= end);
      if (!hadWork) continue;
      const week = entries.filter((e) => e.personId === pid && e.week === w && (e.state === "submitted" || e.state === "approved"));
      const submitted = week.map((e) => e.submittedAt).filter(Boolean).sort()[0];
      if (!week.length) missing++;
      // A submitted or approved week with no recorded time counts as on time.
      else if (!submitted || submitted <= weekDeadline(w, timeZone)) onTime++;
      else late++;
    }
    return {
      personId: pid,
      collaborations: played.filter((s) => s.report?.collaborative).length,
      target: input.target,
      onTime,
      late,
      missing,
      rbMinutesPerWeek: Math.round(mine.reduce((n, a) => n + a.minutes, 0) / elapsedWeeks),
      residentsReached: new Set(mine.flatMap((a) => a.residentIds)).size,
    };
  });
}
