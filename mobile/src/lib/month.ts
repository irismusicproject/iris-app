import { supabase } from "./supabase";
import { WEBSITE } from "./website";

// The monthly scheduling cycle on the phone (DOMAIN-MODEL ScheduleMonth,
// v0.41–v0.44). Every action is one database function (the same ones the
// website calls); sending the calendar goes through the website's endpoint,
// which makes the PDF and emails it.

export type Stage = "team_editing" | "team_confirmed" | "sent_to_partner" | "partner_changes" | "final";
export const STAGES: Stage[] = ["team_editing", "team_confirmed", "sent_to_partner", "partner_changes", "final"];
export const STAGE_LABEL: Record<Stage, string> = {
  team_editing: "Team editing",
  team_confirmed: "Team confirmed",
  sent_to_partner: "Sent to partner",
  partner_changes: "Partner changes",
  final: "Final",
};
export const STAGE_HELP: Record<Stage, string> = {
  team_editing: "Open for the team: leaders add titles; mark dates you can't play; propose leader swaps.",
  team_confirmed: "The Iris Supervisor confirmed the team's version. Dates are locked for musicians; ask the Iris Supervisor for changes.",
  sent_to_partner: "The draft calendar went to the partner. The Lead Musician enters any partner changes.",
  partner_changes: "The Lead Musician is entering the partner's changes, then marks the month final.",
  final: "Final and locked. Ask the Iris Supervisor for a sub or a change; same day, call them.",
};

export type ScheduleMonth = { id: string; residency_id: string; site_id: string; month: string; stage: Stage; team_due_on: string; final_due_on: string };

export type Task = {
  kind: "open_month" | "titles" | "confirm" | "cover" | "approve" | "send" | "partner_changes" | "finalize" | "document" | "submit_week";
  title: string;
  detail: string | null;
  due_on: string;
  residency_id: string | null;
  site_id: string | null;
  month: string | null;
  session_id: string | null;
  request_id: string | null;
};

/** When the email reminder for each kind of task goes out. */
export const REMINDER: Record<Task["kind"], string> = {
  open_month: "Reminder: none; open it on the 1st",
  titles: "Email reminder the day before it's due",
  confirm: "Email reminder the day before it's due",
  cover: "Emailed when they marked it",
  approve: "Emailed when they asked",
  send: "Email reminder the morning it's due",
  partner_changes: "No reminder (only if the partner asks for changes)",
  finalize: "Email reminder the day before it's due",
  document: "Email reminder Monday at noon",
  submit_week: "Email reminder Monday at noon",
};

export async function myTasks(): Promise<Task[]> {
  const { data, error } = await supabase.rpc("my_tasks");
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Ask the website to deliver queued notices now (best effort). */
export async function notifySoon(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) await fetch(`${WEBSITE}/api/notify`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // The scheduler sends it later.
  }
}

export type SendResult = { ok: boolean; emailed?: boolean; message: string };

/** "Send calendar to partner", "Mark final and send", "Email it again". */
export async function monthAction(action: "send" | "finalize" | "resend", residencyId: string, siteId: string, month: string): Promise<SendResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: "Please sign in again." };
  try {
    const res = await fetch(`${WEBSITE}/api/schedule-month`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, residencyId, siteId, month: month.slice(0, 7) }),
    });
    const body = (await res.json().catch(() => null)) as SendResult | null;
    if (body) return body;
    // The website answered, but with an error page (a crash after the
    // database step, Nov 24). The month may already be sent, so say so
    // instead of "couldn't reach", and don't invite a blind retry.
    return {
      ok: false,
      message: `The Iris website had a problem (error ${res.status}). The stage below shows whether it went through. If it says sent, use "Email it again", or open the PDF and send it yourself; otherwise try again.`,
    };
  } catch {
    return { ok: false, message: "No connection. Check your signal and try again." };
  }
}

/** Database messages people see, in plain words (like week-context's friendly()). */
export function plain(error: { code?: string; message?: string }): string {
  const msg = error.message ?? "";
  if (error.code === "42501" && msg && msg !== "not allowed" && !/row-level/.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (error.code === "42501") return "You don't have permission to do that.";
  if ((error.code === "23514" || error.code === "23505" || error.code === "P0001") && msg) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/network|fetch/i.test(msg)) return "No connection. Check your signal and try again.";
  return "We couldn't do that. Please try again.";
}

export const dueLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
};
