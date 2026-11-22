import { timingSafeEqual } from "node:crypto";
import { runScheduledNotifications } from "@/lib/notify";

// Deadline reminders and the notification outbox (v0.24). Called by a
// scheduler (Ryan's side: e.g. every 15 minutes) with
// "Authorization: Bearer <CRON_SECRET>". Vercel Cron sends that header
// automatically when CRON_SECRET is set. Safe to call as often as you like.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404 });
  try {
    return Response.json(await runScheduledNotifications());
  } catch (e) {
    console.error("scheduled notifications failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
