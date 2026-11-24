import { requirePerson } from "@/lib/auth";
import { renderCalendarPdf } from "@/lib/calendar-pdf";
import { createClient } from "@/lib/supabase/server";
import { isMonth } from "@/shared/domain/time";

// The monthly partner calendar as a PDF (docs/GLOSSARY.md, Part B), laid out
// like the calendars Iris sends today. Anyone who can see the program can
// download it (Row Level Security). The layout lives in lib/calendar-pdf.tsx.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; month: string }> }) {
  await requirePerson();
  const { id, month } = await params;
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(siteId) || !isMonth(month))
    return new Response("Not found", { status: 404 });
  const out = await renderCalendarPdf(await createClient(), id, siteId, month);
  if (!out) return new Response("Not found", { status: 404 });
  return new Response(out.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      // ?view=1 opens it in the browser; otherwise it downloads.
      "Content-Disposition": `${new URL(request.url).searchParams.get("view") ? "inline" : "attachment"}; filename="${out.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
