import { deliverSoon } from "@/lib/notify";
import { clientForRequest } from "@/lib/supabase/request";

// The phone app calls this right after an action that queues a message (a
// leader swap, "I can't play", "No Program"…), so it goes out now instead of
// waiting for the scheduler. Sends only what the database already queued;
// signed-in people only. Safe to call often.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await clientForRequest(request))) return new Response(null, { status: 401 });
  await deliverSoon();
  return new Response(null, { status: 204 });
}
