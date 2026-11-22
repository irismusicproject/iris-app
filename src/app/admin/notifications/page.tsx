import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { runScheduledNotifications } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

// Outbox (admins, v0.24): every email the app sends or has queued
// (deadline reminders, "No Program" notices). Read-only, except "Check
// reminders now", which does what the scheduler does.
export const metadata = { title: "Outbox · Iris Music Project" };

const KIND_LABELS: Record<string, string> = {
  no_program: "No Program",
  deadline_reminder: "Reminder (day before)",
  deadline_missed: "Missed deadline",
  deadline_missed_summary: "Missed: point person summary",
  deadline_nudge: "Daily nudge",
};

async function checkNow() {
  "use server";
  await requireAdmin();
  await runScheduledNotifications();
  revalidatePath("/admin/notifications");
}

export default async function OutboxPage() {
  const { isAdmin } = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification")
    .select("id, kind, email, subject, body, created_at, sent_at, delivery, error")
    .order("created_at", { ascending: false })
    .limit(150);
  const rows = data ?? [];
  const when = (t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <AppShell isAdmin={isAdmin}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <form action={checkNow}>
          <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-iris-soft">Check reminders now</button>
        </form>
      </div>
      <p className="mt-1 text-muted">
        Emails the app sends: the day-before reminder, the missed-deadline notice (and a summary for the point person), a daily nudge until
        it&apos;s done, and a note to the point person whenever a date becomes &ldquo;No Program&rdquo;. Times are Eastern.
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((n) => (
          <li key={n.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <details>
              <summary className="cursor-pointer">
                <span className="font-medium">{n.subject}</span>
                <span className="block text-xs text-muted">
                  {KIND_LABELS[n.kind] ?? n.kind} · to {n.email} · {when(n.created_at)} ·{" "}
                  {n.error ? `not sent yet (${n.error})` : !n.sent_at ? "waiting to send" : n.delivery === "email" ? `emailed ${when(n.sent_at)}` : "kept here (email not set up)"}
                </span>
              </summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{n.body}</pre>
            </details>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted">Nothing yet.</li>}
      </ul>
    </AppShell>
  );
}
