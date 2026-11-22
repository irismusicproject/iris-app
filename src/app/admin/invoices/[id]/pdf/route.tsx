import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/shared/domain/documentation";
import type { CustomLine } from "@/shared/domain/partner-invoice";

// A custom invoice as a PDF (v0.23). Admins only. Drafts print "DRAFT".

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
const s = StyleSheet.create({
  page: { fontFamily: "Montserrat", fontSize: 10, color: "#241330", padding: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 140 },
  title: { fontSize: 22, fontWeight: 700, color: PURPLE, textAlign: "right" },
  draft: { fontSize: 11, fontWeight: 700, color: "#C2410C", textAlign: "right", marginTop: 2 },
  meta: { textAlign: "right", marginTop: 4 },
  parties: { flexDirection: "row", marginTop: 28, gap: 40 },
  label: { fontSize: 8, fontWeight: 700, color: PURPLE, marginBottom: 3, textTransform: "uppercase" },
  table: { marginTop: 24 },
  headRow: { flexDirection: "row", backgroundColor: PURPLE, color: "#FFFFFF", fontWeight: 700 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D9D2DE" },
  desc: { width: "52%", padding: 5 },
  qty: { width: "14%", padding: 5, textAlign: "right" },
  rate: { width: "16%", padding: 5, textAlign: "right" },
  amount: { width: "18%", padding: 5, textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: PURPLE, marginTop: 2, fontWeight: 700 },
  totalLabel: { width: "82%", padding: 6, textAlign: "right" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 8, color: "#65566F", textAlign: "center" },
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (viewer.state !== "active" || !viewer.isAdmin) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: inv } = await supabase.from("custom_invoice").select("*").eq("id", id).maybeSingle();
  if (!inv) return new Response("Not found", { status: 404 });
  const lines = inv.lines as CustomLine[];

  const pdf = await renderToBuffer(
    <Document title={`Invoice ${inv.number}`} author="Iris Music Project">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF image, not HTML */}
          <Image style={s.logo} src={path.join(process.cwd(), "public/brand/logo-horizontal-purple.png")} />
          <View>
            <Text style={s.title}>INVOICE</Text>
            {inv.state === "draft" && <Text style={s.draft}>DRAFT</Text>}
            <Text style={s.meta}>No. {inv.number}</Text>
            <Text style={s.meta}>Date: {inv.invoice_date}</Text>
          </View>
        </View>
        <View style={s.parties}>
          <View>
            <Text style={s.label}>From</Text>
            <Text>Iris Music Project</Text>
          </View>
          <View>
            <Text style={s.label}>Bill to</Text>
            {String(inv.bill_to).split("\n").map((line, i) => <Text key={i}>{line}</Text>)}
          </View>
          <View>
            <Text style={s.label}>For</Text>
            <Text>{inv.title}</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={s.desc}>Description</Text>
            <Text style={s.qty}>Qty</Text>
            <Text style={s.rate}>Rate</Text>
            <Text style={s.amount}>Amount</Text>
          </View>
          {lines.map((l, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.desc}>{l.description}</Text>
              <Text style={s.qty}>{l.quantity != null ? String(l.quantity) : ""}</Text>
              <Text style={s.rate}>{l.unit_amount != null ? money(Number(l.unit_amount)) : ""}</Text>
              <Text style={s.amount}>{money(Number(l.amount))}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL DUE</Text>
            <Text style={s.amount}>{money(Number(inv.total))}</Text>
          </View>
        </View>
        <Text style={s.footer}>Thank you for supporting Iris Music Project.</Text>
      </Page>
    </Document>,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${new URL(request.url).searchParams.get("view") ? "inline" : "attachment"}; filename="Invoice ${inv.number}${inv.state === "draft" ? " DRAFT" : ""}.pdf"`,
    },
  });
}
