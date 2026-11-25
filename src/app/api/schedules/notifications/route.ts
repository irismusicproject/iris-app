import { handleSchedule } from "@vercel/schedules";
import { runScheduledNotifications } from "@/lib/notify";

// Deadline and To do reminders, plus anything else waiting in the outbox,
// every hour (vercel.json, "schedules" → "notifications"). This is a private
// Vercel function: it has no public address, and only Vercel's scheduler can
// call it, so it needs no password. Run it by hand from the Vercel dashboard
// (the project's Schedules page → Run Schedule) or with
// `vercel schedules invoke notifications`.
//
// Whether anyone gets an email is still decided by NOTIFICATIONS_ENABLED
// (lib/notify.ts): without it, due reminders are filed in the admin Outbox as
// "outbox only" and never sent later. Queuing is safe to repeat: the database
// queues each reminder once (queue_deadline_reminders, queue_month_reminders).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleSchedule(async (metadata) => {
  const result = await runScheduledNotifications();
  console.log(`notifications run ${metadata.executionId}: ${JSON.stringify(result)}`);
});
