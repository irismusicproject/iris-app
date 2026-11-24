import { runMonthAction } from "@/lib/schedule-month-send";
import { clientForRequest } from "@/lib/supabase/request";

// POST { action: "send" | "finalize" | "resend", residencyId, siteId, month: "YYYY-MM" }
// Called by the phone app (Bearer token) and usable by the website. The
// database decides who may do it; see lib/schedule-month-send.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await clientForRequest(request);
  if (!supabase) return Response.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "That request isn't valid." }, { status: 400 });
  }
  const result = await runMonthAction(supabase, { action: body.action, residencyId: body.residencyId, siteId: body.siteId, month: body.month });
  return Response.json(result, { status: result.ok ? 200 : result.code === "42501" ? 403 : 400 });
}
