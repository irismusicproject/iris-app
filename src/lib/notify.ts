import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The one notification layer (CLAUDE.md, "Platform strategy"; DOMAIN-MODEL
// v0.24). The database queues every message in public.notification (so web
// and native apps trigger the same ones); this module delivers them. Email
// first; push notifications can be added here later.
//
// Delivery, in order:
//  1. RESEND_API_KEY set (production): sent through Resend.
//  2. Local prototype (Supabase at 127.0.0.1): dropped into the local mail
//     viewer (Mailpit), like sign-in emails.
//  3. Otherwise: kept in the admin Outbox only.

const FROM = "Iris Music Project <no-reply@mail.irismusicproject.org>";

type Pending = { id: string; email: string; subject: string; body: string };

async function send(n: Pending): Promise<"email" | "outbox_only"> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `notification-${n.id}` },
      body: JSON.stringify({ from: FROM, to: [n.email], subject: n.subject, text: n.body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "email";
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (supabaseUrl.startsWith("http://127.0.0.1")) {
    const res = await fetch("http://127.0.0.1:54324/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: "no-reply@mail.irismusicproject.org", Name: "Iris Music Project" }, To: [{ Email: n.email }], Subject: n.subject, Text: n.body }),
    });
    if (!res.ok) throw new Error(`local mail viewer ${res.status}`);
    return "email";
  }
  return "outbox_only";
}

/** Delivers queued notifications. Safe to call often; each is sent once. */
export async function deliverPending(limit = 50): Promise<{ sent: number; failed: number }> {
  const db = createAdminClient();
  const { data } = await db.from("notification").select("id, email, subject, body").is("sent_at", null).order("created_at").limit(limit);
  let sent = 0;
  let failed = 0;
  for (const n of (data ?? []) as Pending[]) {
    try {
      const delivery = await send(n);
      await db.from("notification").update({ sent_at: new Date().toISOString(), delivery, error: null }).eq("id", n.id).is("sent_at", null);
      sent++;
    } catch (e) {
      failed++;
      await db.from("notification").update({ error: e instanceof Error ? e.message.slice(0, 300) : "failed" }).eq("id", n.id);
    }
  }
  return { sent, failed };
}

/** Queues due deadline reminders (the database decides who and when), then delivers. */
export async function runScheduledNotifications(): Promise<{ queued: number; sent: number; failed: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("queue_deadline_reminders");
  if (error) throw new Error(`queue_deadline_reminders: ${error.message}`);
  const delivered = await deliverPending(200);
  return { queued: Number(data ?? 0), ...delivered };
}

/** Best effort right after an action that queues a message (e.g. "No Program"). Never fails the action. */
export async function deliverSoon(): Promise<void> {
  try {
    await deliverPending(20);
  } catch (e) {
    console.error("notification delivery failed:", e instanceof Error ? e.message : e);
  }
}
