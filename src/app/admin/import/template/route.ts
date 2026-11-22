import { getViewer } from "@/lib/auth";
import { importTemplate } from "@/lib/import-workbook";

// The import template (admins, v0.29): headers plus made-up example rows.
export const runtime = "nodejs";

export async function GET() {
  const viewer = await getViewer();
  if (viewer.state !== "active" || !viewer.isAdmin) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await importTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Iris import template.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
