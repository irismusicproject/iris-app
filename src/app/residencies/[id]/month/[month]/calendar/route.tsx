import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { requirePerson } from "@/lib/auth";
import { getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { buildCalendar, type CalendarSection, type CalendarSessionInput } from "@/shared/domain/calendar";
import { formatMonth, isMonth, localDateTime, monthWindow } from "@/shared/domain/time";

// The monthly partner calendar as a PDF (docs/GLOSSARY.md, Part B), laid out
// like the calendars Iris sends today, with the Iris logo and brand type.
// Anyone who can see the program can download it (Row Level Security).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fontDir = path.join(process.cwd(), "node_modules/@fontsource/montserrat/files");
Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(fontDir, "montserrat-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(fontDir, "montserrat-latin-500-normal.woff"), fontWeight: 500 },
    { src: path.join(fontDir, "montserrat-latin-700-normal.woff"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const PURPLE = "#411F50";
const PINK_SOFT = "#FBEAF2";
const GRAY = "#F1F1F1";
const s = StyleSheet.create({
  page: { fontFamily: "Montserrat", fontSize: 8.5, color: "#241330", paddingVertical: 26, paddingHorizontal: 44 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logo: { width: 120 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 18, fontWeight: 700, color: PURPLE },
  month: { fontSize: 11, fontWeight: 500, marginTop: 4 },
  headRow: { flexDirection: "row", backgroundColor: PURPLE, color: "#FFFFFF", fontWeight: 700 },
  section: { flexDirection: "row", backgroundColor: PINK_SOFT, marginTop: 5 },
  sectionText: { fontWeight: 500, color: PURPLE, paddingVertical: 2.5, paddingHorizontal: 5 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D9D2DE" },
  blockStart: { borderTopWidth: 1.2, borderTopColor: PURPLE },
  day: { width: "22%", paddingVertical: 2.5, paddingHorizontal: 5, backgroundColor: GRAY },
  time: { width: "11%", paddingVertical: 2.5, paddingHorizontal: 5 },
  titleCell: { width: "45%", paddingVertical: 2.5, paddingHorizontal: 5 },
  musicians: { width: "22%", paddingVertical: 2.5, paddingHorizontal: 5 },
  note: { fontSize: 8, color: "#65566F", marginTop: 2 },
  footer: { position: "absolute", bottom: 12, left: 48, right: 48, fontSize: 8, color: "#65566F", textAlign: "center" },
});

function CalendarPdf({ siteName, monthLabel, sections }: { siteName: string; monthLabel: string; sections: CalendarSection[] }) {
  return (
    <Document title={`${siteName} Programming – ${monthLabel}`} author="Iris Music Project">
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF image, not HTML */}
          <Image style={s.logo} src={path.join(process.cwd(), "public/brand/logo-horizontal-purple.png")} />
          <View style={s.titleBox}>
            <Text style={s.title}>{siteName} Programming</Text>
            <Text style={s.month}>Month: {monthLabel}</Text>
          </View>
        </View>
        <View style={s.headRow} fixed>
          <Text style={[s.day, { backgroundColor: PURPLE }]}>Day</Text>
          <Text style={s.time}>Time</Text>
          <Text style={s.titleCell}>Program Title</Text>
          <Text style={s.musicians}>Musicians</Text>
        </View>
        {sections.map((section) => (
          <View key={section.heading}>
            <View style={s.section} wrap={false}>
              <Text style={s.sectionText}>{section.heading}</Text>
            </View>
            {section.blocks.map((block, bi) =>
              block.map((r, ri) => (
                <View key={`${bi}-${ri}`} style={ri === 0 && bi > 0 ? [s.row, s.blockStart] : s.row} wrap={false}>
                  <Text style={s.day}>{r.day}</Text>
                  <Text style={s.time}>{r.time}</Text>
                  <View style={s.titleCell}>
                    <Text>{r.title}</Text>
                    {r.note ? <Text style={s.note}>{r.note}</Text> : null}
                  </View>
                  <Text style={s.musicians}>{r.musicians}</Text>
                </View>
              )),
            )}
          </View>
        ))}
        {sections.length === 0 && <Text style={{ marginTop: 16 }}>Nothing is published for this month yet.</Text>}
        <Text style={s.footer} fixed>Iris Music Project · irismusicproject.org</Text>
      </Page>
    </Document>
  );
}

type Row = Omit<CalendarSessionInput, "musicians"> & {
  location: { site_id: string } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string; month: string }> }) {
  await requirePerson();
  const { id, month } = await params;
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(siteId) || !isMonth(month))
    return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: site } = await supabase.from("site").select("id, display_name, timezone").eq("id", siteId).maybeSingle();
  if (!site) return new Response("Not found", { status: 404 });
  const w = monthWindow(month);
  const [{ data }, names] = await Promise.all([
    supabase
      .from("session")
      .select(
        "id, series_id, title, starts_at, has_set_time, is_special_event, schedule_state, public_note, series(title, weekdays, start_time), location(site_id), session_assignment(person_id, role, status)",
      )
      .eq("residency_id", id)
      .gte("starts_at", w.from)
      .lt("starts_at", w.to),
    getResidencyNames(id),
  ]);
  const first = (pid: string) => (names.get(pid) ?? "").split(" ")[0];
  const sessions: CalendarSessionInput[] = ((data ?? []) as unknown as Row[])
    .filter((r) => r.location?.site_id === site.id && localDateTime(r.starts_at, site.timezone).date.startsWith(month))
    .map((r) => ({
      ...r,
      musicians: r.session_assignment
        .filter((a) => a.status !== "absent")
        .sort((a, b) => Number(b.role === "leader") - Number(a.role === "leader") || first(a.person_id).localeCompare(first(b.person_id)))
        .map((a) => first(a.person_id))
        .filter(Boolean),
    }));

  const monthLabel = formatMonth(month);
  const pdf = await renderToBuffer(
    <CalendarPdf siteName={site.display_name} monthLabel={monthLabel} sections={buildCalendar(sessions, site.timezone)} />,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // ?view=1 opens it in the browser; otherwise it downloads.
      "Content-Disposition": `${new URL(request.url).searchParams.get("view") ? "inline" : "attachment"}; filename="${site.display_name} - ${monthLabel} - Iris calendar.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
