import { createClient } from "@/lib/supabase/server";
import { localDateTime } from "@/shared/domain/time";

// A musician's private calendar subscription (iCalendar / .ics), which Google,
// Apple and Outlook calendars refresh on their own. The secret token is the
// only key; calendar_feed_events() returns nothing for an unknown token.
// DOMAIN-MODEL v0.15. Security review: Ryan's side.

export const dynamic = "force-dynamic";

type Event = {
  session_id: string;
  starts_at: string;
  minutes: number;
  has_set_time: boolean;
  title: string;
  canceled: boolean;
  is_special_event: boolean;
  residency_name: string;
  site_name: string;
  room: string;
  timezone: string;
  musicians: string | null;
  updated_at: string;
};

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const day = (iso: string) => iso.replace(/-/g, "");

/** Lines longer than 75 characters are folded, as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? " " : "") + line.slice(i, i + 73));
  return out.join("\r\n");
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{32,128}$/.test(clean)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed_events", { p_token: clean });
  if (error) {
    console.error("calendar feed failed:", error.code, error.message);
    return new Response("Calendar unavailable", { status: 500 });
  }
  // An unknown token and an empty calendar look the same, so a guessed link reveals nothing.
  const events = (data ?? []) as Event[];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Iris Music Project//Iris app//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Iris Music Project",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const start = new Date(e.starts_at);
    const summary = e.canceled ? `No Program (${e.title})` : e.title;
    const desc = [
      e.musicians ? `With ${e.musicians}` : null,
      e.is_special_event ? "Special event" : null,
      e.residency_name,
    ].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.session_id}@irismusicproject.org`, `DTSTAMP:${utc(new Date(e.updated_at))}`);
    if (e.has_set_time) {
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(new Date(start.getTime() + e.minutes * 60_000))}`);
    } else {
      const local = localDateTime(e.starts_at, e.timezone).date;
      const next = new Date(`${local}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day(local)}`, `DTEND;VALUE=DATE:${day(next.toISOString().slice(0, 10))}`);
    }
    lines.push(
      fold(`SUMMARY:${esc(summary)}`),
      fold(`LOCATION:${esc(`${e.room}, ${e.site_name}`)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      `STATUS:${e.canceled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="iris.ics"',
      "Cache-Control": "no-store",
    },
  });
}
