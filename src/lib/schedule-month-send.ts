import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderCalendarPdf } from "@/lib/calendar-pdf";
import { canSendEmail, deliverSoon, notificationsOn, sendEmail } from "@/lib/notify";
import { isMonth } from "@/shared/domain/time";

// "Send calendar to partner" and "Mark final and send" (DOMAIN-MODEL
// ScheduleMonth, v0.41): one button each, the same on the phone and the
// website. The database function moves the stage and checks permission
// first; then this makes the PDF from the published dates and emails it from
// Iris to the building's calendar contacts, point person and Admin Lead cc'd.

export type MonthAction = "send" | "finalize" | "resend";
export type MonthActionResult =
  | { ok: true; emailed: boolean; version: number; final: boolean; to: string[]; message: string }
  | { ok: false; message: string; code?: string };

const RPC: Record<MonthAction, "send_schedule_month" | "finalize_schedule_month" | "schedule_month_send_info"> = {
  send: "send_schedule_month",
  finalize: "finalize_schedule_month",
  resend: "schedule_month_send_info",
};

type SendInfo = { export_id: string; version: number; final: boolean; to: { name: string; email: string }[]; cc: string[] };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function runMonthAction(
  supabase: SupabaseClient,
  input: { action: unknown; residencyId: unknown; siteId: unknown; month: unknown },
): Promise<MonthActionResult> {
  const { action, residencyId, siteId, month } = input;
  if (!(action === "send" || action === "finalize" || action === "resend") || !isId(residencyId) || !isId(siteId) || typeof month !== "string" || !isMonth(month))
    return { ok: false, message: "That request isn't valid." };

  const { data, error } = await supabase.rpc(RPC[action], { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` });
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "42501") return { ok: false, code: error.code, message: "You don't have permission to do that." };
    if (/leader/.test(msg)) return { ok: false, code: error.code, message: `${msg.charAt(0).toUpperCase()}${msg.slice(1)}. Ask the point person to set them first.` };
    if (error.code === "23514" && msg) return { ok: false, code: error.code, message: `${msg.charAt(0).toUpperCase()}${msg.slice(1)}.` };
    return { ok: false, code: error.code, message: "We couldn't do that. Please try again." };
  }
  const info = data as SendInfo;
  const to = info.to.map((t) => t.email);
  const what = info.final ? "final" : "draft";
  const done = action === "finalize" ? "Marked final" : action === "send" ? "Sent to the partner" : "Emailed again";
  const base = { version: info.version, final: info.final, to };

  if (!to.length)
    return { ok: true, emailed: false, ...base, message: `${done === "Emailed again" ? "Nothing emailed" : done + ", but nothing was emailed"}: no partner contact at this building is marked to receive calendars. Download the PDF and send it yourself, or ask an admin to add a contact.` };
  if (!notificationsOn() || !canSendEmail())
    return { ok: true, emailed: false, ...base, message: `${done}. Email isn't switched on here (test version), so nobody was emailed. Download the PDF to check it.` };

  try {
    const pdf = await renderCalendarPdf(supabase, residencyId, siteId, month);
    if (!pdf) throw new Error("no calendar");
    const { data: me } = await supabase.auth.getUser();
    const { data: person } = me.user ? await supabase.from("person").select("name").eq("id", me.user.id).maybeSingle() : { data: null };
    await sendEmail({
      to,
      cc: info.cc,
      subject: `${pdf.siteName} Programming – ${pdf.monthLabel} (${what} calendar)`,
      text:
        `Hello,\n\nAttached is the ${what} Iris Music Project calendar for ${pdf.siteName}, ${pdf.monthLabel}` +
        (info.final ? "." : ". Please let us know of any changes.") +
        `\n\nThank you,\n${person?.name ?? "Iris Music Project"}\nIris Music Project`,
      attachments: [{ filename: pdf.filename, content: pdf.pdf }],
      idempotencyKey: `calendar-${info.export_id}-${action === "resend" ? Date.now() : action}`,
    });
    return { ok: true, emailed: true, ...base, message: `${done}: emailed to ${info.to.map((t) => t.name).join(", ")}, with copies to the point person and Admin Lead.` };
  } catch (e) {
    console.error("calendar email failed:", e instanceof Error ? e.message : e);
    return { ok: true, emailed: false, ...base, message: `${done}, but the email didn't go out. Try "Email it again", or download the PDF and send it yourself.` };
  } finally {
    await deliverSoon();
  }
}
