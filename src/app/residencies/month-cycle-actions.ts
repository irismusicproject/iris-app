"use server";

// The monthly scheduling cycle on the website (DOMAIN-MODEL ScheduleMonth,
// v0.41–v0.45). Each action is one database function with its permission
// check inside, the same ones the phone app calls, so both behave the same.
// Sending the calendar shares lib/schedule-month-send.ts with the phone's
// /api/schedule-month endpoint.

import { revalidatePath } from "next/cache";
import { requirePerson } from "@/lib/auth";
import { deliverSoon } from "@/lib/notify";
import { runMonthAction, type MonthAction } from "@/lib/schedule-month-send";
import { createClient } from "@/lib/supabase/server";
import { CANCELLATION_REASONS, type CancellationReason } from "@/shared/domain/scheduling";

export type CycleResult = { ok: boolean; message: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

function plain(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  const sentence = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;
  if (error.code === "42501") return m && m !== "not allowed" && !/row-level/.test(m) ? sentence(m) : "You don't have permission to do that.";
  if ((error.code === "23514" || error.code === "23505" || error.code === "P0001") && m) return error.code === "23505" ? "You've already asked; the point person will decide." : sentence(m);
  console.error("month cycle action failed:", error.code, m);
  return "We couldn't do that. Please try again.";
}

async function call(fn: string, args: Record<string, unknown>, done: string): Promise<CycleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) return { ok: false, message: plain(error) };
  await deliverSoon();
  revalidatePath("/", "layout");
  return { ok: true, message: done };
}

export async function openMonth(residencyId: string, month: string): Promise<CycleResult> {
  if (!isId(residencyId) || !isMonth(month)) return { ok: false, message: "That request isn't valid." };
  return call("open_schedule_month", { p_residency: residencyId, p_site: null, p_month: `${month}-01` }, "Opened for the team. The musicians playing have been emailed.");
}

export async function confirmMonth(residencyId: string, siteId: string, month: string): Promise<CycleResult> {
  if (!isId(residencyId) || !isId(siteId) || !isMonth(month)) return { ok: false, message: "That request isn't valid." };
  return call("confirm_schedule_month", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` }, "Confirmed. Dates are locked for musicians; the admin lead can send it to the partner.");
}

export async function undoConfirmMonth(residencyId: string, siteId: string, month: string): Promise<CycleResult> {
  if (!isId(residencyId) || !isId(siteId) || !isMonth(month)) return { ok: false, message: "That request isn't valid." };
  return call("undo_confirm_schedule_month", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` }, "Reopened for the team.");
}

export async function sendMonth(action: MonthAction, residencyId: string, siteId: string, month: string): Promise<CycleResult> {
  await requirePerson();
  const r = await runMonthAction(await createClient(), { action, residencyId, siteId, month });
  revalidatePath("/", "layout");
  return { ok: r.ok, message: r.message };
}

export async function decideRequest(requestId: string, approve: boolean): Promise<CycleResult> {
  if (!isId(requestId)) return { ok: false, message: "That request isn't valid." };
  return call("decide_change_request", { p_request: requestId, p_approve: approve }, approve ? "Approved. They've been emailed." : "Declined. They've been emailed.");
}

export async function setUnavailable(sessionId: string, unavailable: boolean): Promise<CycleResult> {
  if (!isId(sessionId)) return { ok: false, message: "That request isn't valid." };
  return call("set_unavailable", { p_session: sessionId, p_unavailable: unavailable }, unavailable ? "Marked: you can't play this date. The point person has been told." : "Undone: you're playing it again.");
}

export async function proposeLeader(sessionId: string, personId: string): Promise<CycleResult> {
  if (!isId(sessionId) || !isId(personId)) return { ok: false, message: "Pick who should lead." };
  return call("request_leader_swap", { p_session: sessionId, p_person: personId }, "Sent to the point person for approval.");
}

export async function askForSub(sessionId: string, personId: string): Promise<CycleResult> {
  if (!isId(sessionId) || !isId(personId)) return { ok: false, message: "Pick who'll play for you." };
  return call("request_change", { p_session: sessionId, p_kind: "sub", p_person: personId, p_note: null }, "Sent to the point person for approval.");
}

export async function markNotThere(sessionId: string, notThere: boolean): Promise<CycleResult> {
  if (!isId(sessionId)) return { ok: false, message: "That request isn't valid." };
  return call("mark_not_there", { p_session: sessionId, p_not_there: notThere }, notThere ? "Marked: you weren't there. The point person has been told." : "Undone.");
}

export async function takeLeadToDocument(sessionId: string): Promise<CycleResult> {
  if (!isId(sessionId)) return { ok: false, message: "That request isn't valid." };
  return call("take_lead_to_document", { p_session: sessionId }, "You're now this date's leader, so you can document it.");
}

export async function cancelDayOf(sessionId: string, reason: CancellationReason): Promise<CycleResult> {
  if (!isId(sessionId) || !CANCELLATION_REASONS.includes(reason)) return { ok: false, message: "Pick why it was canceled." };
  return call("cancel_day_of", { p_session: sessionId, p_reason: reason }, "Recorded as canceled day-of (“No Program”). The point person has been told.");
}
