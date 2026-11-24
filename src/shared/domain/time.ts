// Dates and times in a site's own time zone (sites span ET, CT and Arizona).
// Sessions are stored as instants (timestamptz); people see and enter them in
// the site's local time, whatever time zone their own device is in.

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(date: Date, timeZone: string): Parts {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Minutes the time zone is ahead of UTC at that instant (e.g. -300 for EST). */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60000;
}

/** "2027-02-02" + "15:00" in America/New_York → ISO instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const naive = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  let t = naive.getTime() - offsetMinutes(naive, timeZone) * 60000;
  t = naive.getTime() - offsetMinutes(new Date(t), timeZone) * 60000; // settle across DST changes
  return new Date(t).toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local date ("2027-02-02") and time ("15:00") of an instant at a site. */
export function localDateTime(iso: string, timeZone: string): { date: string; time: string } {
  const p = partsIn(new Date(iso), timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Today's date ("YYYY-MM-DD") where the programs are, never the server's UTC
 *  clock: after about 7 pm Eastern, UTC is already tomorrow (bug class of #67). */
export function todayIn(timeZone = "America/New_York"): string {
  return localDateTime(new Date().toISOString(), timeZone).date;
}

/** "3:00 PM" */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "Tuesday, December 1" (regular programming) or "December 1" (special events). */
export function formatDay(iso: string, timeZone: string, withWeekday = true): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(withWeekday ? { weekday: "long" } : {}),
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** "2027-02" → "February 2027" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2027-02" → previous / next "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** A UTC window safely covering a local month anywhere in the US. */
export function monthWindow(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString(),
    to: new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString(),
  };
}

/** "12:45 PM – 1:15 PM" from two "HH:MM[:SS]" times (detailed relationship notes, v0.36). */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const one = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  return `${one(start)} – ${one(end)}`;
}
