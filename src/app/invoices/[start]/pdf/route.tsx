import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { getViewer } from "@/lib/auth";
import { getInvoiceLines, getPayPeriodAnchor, invoiceNumber, type InvoiceLine } from "@/lib/invoices";
import { addDays, formatPayPeriod, money, payPeriodStart } from "@/shared/domain/documentation";

// A contractor's invoice for one two-week pay period, as a PDF (v0.19).
// Only the musician themself can download it here (the database function
// also allows admins).

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
  meta: { textAlign: "right", marginTop: 4 },
  parties: { flexDirection: "row", marginTop: 28, gap: 40 },
  label: { fontSize: 8, fontWeight: 700, color: PURPLE, marginBottom: 3, textTransform: "uppercase" },
  table: { marginTop: 28 },
  headRow: { flexDirection: "row", backgroundColor: PURPLE, color: "#FFFFFF", fontWeight: 700 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D9D2DE" },
  residency: { width: "26%", padding: 5 },
  desc: { width: "34%", padding: 5 },
  qty: { width: "12%", padding: 5, textAlign: "right" },
  rate: { width: "14%", padding: 5, textAlign: "right" },
  amount: { width: "14%", padding: 5, textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: PURPLE, marginTop: 2, fontWeight: 700 },
  totalLabel: { width: "86%", padding: 6, textAlign: "right" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 8, color: "#65566F", textAlign: "center" },
});

function InvoicePdf({ name, email, number, start, lines, total }: { name: string; email: string; number: string; start: string; lines: InvoiceLine[]; total: number }) {
  return (
    <Document title={`Invoice ${number}`} author={name}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF image, not HTML */}
          <Image style={s.logo} src={path.join(process.cwd(), "public/brand/logo-horizontal-purple.png")} />
          <View>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.meta}>No. {number}</Text>
            <Text style={s.meta}>Date: {addDays(start, 14)}</Text>
          </View>
        </View>
        <View style={s.parties}>
          <View>
            <Text style={s.label}>From</Text>
            <Text>{name}</Text>
            <Text>{email}</Text>
          </View>
          <View>
            <Text style={s.label}>Bill to</Text>
            <Text>Iris Music Project</Text>
          </View>
          <View>
            <Text style={s.label}>Period</Text>
            <Text>{formatPayPeriod(start)}</Text>
            <Text>2-week period, Monday–Sunday</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={s.residency}>Program</Text>
            <Text style={s.desc}>Description</Text>
            <Text style={s.qty}>Qty</Text>
            <Text style={s.rate}>Rate</Text>
            <Text style={s.amount}>Amount</Text>
          </View>
          {lines.map((l, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.residency}>{l.residency_name}</Text>
              <Text style={s.desc}>{l.description}</Text>
              <Text style={s.qty}>{l.unit === "hours" ? `${l.quantity} hrs` : String(l.quantity)}</Text>
              <Text style={s.rate}>{l.unit_amount === null ? "—" : money(l.unit_amount)}</Text>
              <Text style={s.amount}>{money(l.amount)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL DUE</Text>
            <Text style={s.amount}>{money(total)}</Text>
          </View>
        </View>
        <Text style={s.footer}>Hours as approved in the Iris app. Thank you!</Text>
      </Page>
    </Document>
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ start: string }> }) {
  const viewer = await getViewer();
  if (viewer.state !== "active" || viewer.person.employment_type !== "contractor_1099") return new Response("Not found", { status: 404 });
  const { start } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || payPeriodStart(start, await getPayPeriodAnchor()) !== start) return new Response("Not found", { status: 404 });

  const { person } = viewer;
  const { lines, total } = await getInvoiceLines(person.id, start);
  const number = invoiceNumber(person.name, start);
  const pdf = await renderToBuffer(<InvoicePdf name={person.name} email={person.email} number={number} start={start} lines={lines} total={total} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${new URL(request.url).searchParams.get("view") ? "inline" : "attachment"}; filename="Invoice ${number}.pdf"`,
    },
  });
}
