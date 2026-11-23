import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { formatTimeRange } from "@/shared/domain/time";
import { getViewer } from "@/lib/auth";
import { getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_KIND_LABELS, type ActivityKind } from "@/shared/domain/documentation";

// One day's relationship building at one site, as a Word document for the
// partner (DOMAIN-MODEL v0.21). Only for sites with detailed notes switched
// on. Row Level Security decides whose activities are included: a musician
// gets their own; the point person and admins get everyone's.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  residency_id: string;
  person_id: string;
  kind: ActivityKind;
  minutes: number;
  collaborative: boolean;
  note: string | null;
  visit_room: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  relationship_activity_resident: { resident: { display_name: string; disambiguator: string } | null }[];
};

const PURPLE = "411F50";

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const viewer = await getViewer();
  if (viewer.state !== "active") return new Response("Not found", { status: 404 });
  const { siteId } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: site } = await supabase.from("site").select("display_name, detailed_relationship_notes, partner(display_name)").eq("id", siteId).maybeSingle();
  if (!site || !site.detailed_relationship_notes) return new Response("Not found", { status: 404 });

  const { data } = await supabase
    .from("relationship_activity")
    .select("residency_id, person_id, kind, minutes, collaborative, note, visit_room, start_time, end_time, created_at, relationship_activity_resident(resident(display_name, disambiguator))")
    .eq("site_id", siteId)
    .eq("occurred_on", date)
    .order("start_time", { nullsFirst: false })
    .order("created_at");
  const rows = (data ?? []) as unknown as Row[];
  const nameMaps = new Map<string, Map<string, string>>();
  for (const rid of new Set(rows.map((r) => r.residency_id))) nameMaps.set(rid, await getResidencyNames(rid));
  const musician = (r: Row) => nameMaps.get(r.residency_id)?.get(r.person_id) ?? (r.person_id === viewer.person.id ? viewer.person.name : "Iris musician");
  const residentsOf = (r: Row) =>
    r.relationship_activity_resident
      .map((x) => x.resident && (x.resident.disambiguator ? `${x.resident.display_name} (${x.resident.disambiguator})` : x.resident.display_name))
      .filter(Boolean)
      .join(", ") || "Residents present";

  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const partnerName = (site.partner as unknown as { display_name: string } | null)?.display_name;
  const totalMinutes = rows.reduce((n, r) => n + r.minutes, 0);
  const thin = { style: BorderStyle.SINGLE, size: 4, color: "D9D2DE" };
  const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };
  const labelCell = (text: string) =>
    new TableCell({ borders: cellBorders, width: { size: 22, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: PURPLE })] })] });
  const valueCell = (text: string) =>
    new TableCell({ borders: cellBorders, width: { size: 78, type: WidthType.PERCENTAGE }, children: text.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })) });

  const doc = new Document({
    creator: "Iris Music Project",
    title: `Relationship building, ${site.display_name}, ${date}`,
    styles: { default: { document: { run: { font: "Montserrat", size: 21 } } } },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Iris Music Project", color: PURPLE, bold: true })] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `Relationship building at ${site.display_name}`, color: PURPLE })] }),
          new Paragraph({ children: [new TextRun({ text: dayLabel, bold: true })] }),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun(`${rows.length} visit${rows.length === 1 ? "" : "s"} · ${totalMinutes} minutes${partnerName ? ` · Prepared for ${partnerName}` : ""}`)],
          }),
          ...(rows.length === 0 ? [new Paragraph("Nothing logged for this day.")] : []),
          ...rows.flatMap((r, i) => [
            new Paragraph({
              spacing: { before: 240, after: 80 },
              children: [new TextRun({ text: `${i + 1}. ${residentsOf(r)}`, bold: true, size: 24 })],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [labelCell("Type"), valueCell(ACTIVITY_KIND_LABELS[r.kind] ?? r.kind)] }),
                new TableRow({ children: [labelCell("Musician"), valueCell(musician(r))] }),
                ...(formatTimeRange(r.start_time, r.end_time) ? [new TableRow({ children: [labelCell("Time"), valueCell(formatTimeRange(r.start_time, r.end_time)!)] })] : []),
                ...(r.visit_room ? [new TableRow({ children: [labelCell("Room"), valueCell(r.visit_room)] })] : []),
                new TableRow({ children: [labelCell("Length"), valueCell(`${r.minutes} minutes${r.collaborative ? " · Collaborative" : ""}`)] }),
                new TableRow({ children: [labelCell("Notes"), valueCell(r.note ?? "")] }),
              ],
            }),
          ]),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480 },
            children: [new TextRun({ text: "From the Iris Music Project app. Music and engagement only; no health information.", size: 16, color: "65566F" })],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${site.display_name} - relationship building - ${date}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
