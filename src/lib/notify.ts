import "server-only";
import { routeEmail } from "@/lib/email-redirect";
import { createAdminClient } from "@/lib/supabase/admin";

// The one notification layer (CLAUDE.md, "Platform strategy"; DOMAIN-MODEL
// v0.24). The database queues every message in public.notification (so web
// and native apps trigger the same ones); this module delivers them. Email
// first; push notifications can be added here later.
//
// Two separate things decide what happens (Ryan's side, Nov 22, 2026):
//  - HOW email is sent: through Resend when RESEND_API_KEY is set, or the
//    local mail viewer (Mailpit) when running the local prototype.
//  - WHETHER queued notifications (No Program, deadline reminders) go out:
//    only when NOTIFICATIONS_ENABLED=true. Until then they stay in the admin
//    Outbox, marked "outbox only", and are never sent later.
// Keeping them apart lets sign-in emails such as the welcome email
// (lib/welcome-email.ts) use Resend while notifications stay off.

const MAX_ATTEMPTS = 5;

/** Staging (Vercel previews) sends as "Iris (staging)" so test emails are easy to tell apart (README). */
function fromAddress(): string {
  return process.env.VERCEL_ENV === "preview"
    ? "Iris (staging) <staging@mail.irismusicproject.org>"
    : "Iris Music Project <no-reply@mail.irismusicproject.org>";
}

function isLocal(): boolean {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("http://127.0.0.1");
}

/** Whether an email service is configured at all (Resend, or the local mail viewer). */
export function canSendEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || isLocal();
}

export type Attachment = { filename: string; content: Uint8Array };

/** Sends one plain-text email now. Throws if no email service is configured or the send fails. */
export async function sendEmail(m: {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: Attachment[];
  idempotencyKey?: string;
}): Promise<void> {
  // Staging sends only to its test inbox (lib/email-redirect.ts).
  const routed = routeEmail(
    { to: Array.isArray(m.to) ? m.to : [m.to], cc: m.cc ?? [], subject: m.subject, text: m.text },
    { vercelEnv: process.env.VERCEL_ENV, redirectTo: process.env.STAGING_EMAIL_TO },
  );
  if (!routed.send) throw new Error(routed.reason);
  const { to, subject, text } = routed.email;
  const cc = routed.email.cc.filter((e) => !to.includes(e));
  const files = (m.attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") }));
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromAddress(),
        to,
        ...(cc.length ? { cc } : {}),
        subject,
        text,
        ...(files.length ? { attachments: files } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return;
  }
  if (isLocal()) {
    const from = fromAddress().match(/^(.*) <(.*)>$/)!;
    const res = await fetch("http://127.0.0.1:54324/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: from[2], Name: from[1] },
        To: to.map((Email) => ({ Email })),
        Cc: cc.map((Email) => ({ Email })),
        Subject: subject,
        Text: text,
        Attachments: files.map((f) => ({ Filename: f.filename, Content: f.content, ContentType: "application/pdf" })),
      }),
    });
    if (!res.ok) throw new Error(`local mail viewer ${res.status}`);
    return;
  }
  throw new Error("no email service is configured");
}

type Pending = { id: string; email: string; subject: string; body: string; attempts: number };

export function notificationsOn(): boolean {
  return process.env.NOTIFICATIONS_ENABLED === "true" || isLocal();
}

/** Delivers queued notifications. Safe to call often; each is sent once, and one that keeps failing stops after MAX_ATTEMPTS. */
export async function deliverPending(limit = 50): Promise<{ sent: number; failed: number }> {
  const db = createAdminClient();
  const { data } = await db.from("notification").select("id, email, subject, body, attempts")
    .is("sent_at", null).lt("attempts", MAX_ATTEMPTS).order("created_at").limit(limit);
  let sent = 0;
  let failed = 0;
  for (const n of (data ?? []) as Pending[]) {
    if (!notificationsOn()) {
      await db.from("notification").update({ sent_at: new Date().toISOString(), delivery: "outbox_only", error: null }).eq("id", n.id).is("sent_at", null);
      continue;
    }
    try {
      await sendEmail({ to: n.email, subject: n.subject, text: n.body, idempotencyKey: `notification-${n.id}` });
      await db.from("notification").update({ sent_at: new Date().toISOString(), delivery: "email", error: null }).eq("id", n.id).is("sent_at", null);
      sent++;
    } catch (e) {
      failed++;
      const attempts = n.attempts + 1;
      const why = e instanceof Error ? e.message.slice(0, 250) : "failed";
      await db.from("notification")
        .update({ attempts, error: attempts >= MAX_ATTEMPTS ? `stopped after ${MAX_ATTEMPTS} tries: ${why}` : why })
        .eq("id", n.id);
    }
  }
  return { sent, failed };
}

/** Queues due deadline reminders (the database decides who and when), then delivers. */
export async function runScheduledNotifications(): Promise<{ queued: number; sent: number; failed: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("queue_deadline_reminders");
  if (error) throw new Error(`queue_deadline_reminders: ${error.message}`);
  // Reminders that pair with To do tasks (DOMAIN-MODEL ScheduleMonth, v0.43).
  const { data: monthly, error: monthError } = await db.rpc("queue_month_reminders");
  if (monthError) throw new Error(`queue_month_reminders: ${monthError.message}`);
  const delivered = await deliverPending(200);
  return { queued: Number(data ?? 0) + Number(monthly ?? 0), ...delivered };
}

/** Best effort right after an action that queues a message (e.g. "No Program"). Never fails the action. */
export async function deliverSoon(): Promise<void> {
  try {
    await deliverPending(20);
  } catch (e) {
    console.error("notification delivery failed:", e instanceof Error ? e.message : e);
  }
}
