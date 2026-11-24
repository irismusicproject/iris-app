import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { getViewer } from "@/lib/auth";
import { getAgreements, getBillTo, loadPartnerInvoices, type ShownInvoice } from "@/lib/partner-invoices";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/shared/domain/documentation";
import { formatInvoiceMonth } from "@/shared/domain/partner-invoice";

// A community invoice as a PDF (GLOSSARY Part B, "Community invoice"; v0.22).
// Admins only. Drafts are marked DRAFT; sent invoices print their frozen copy.

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
  progress: { marginTop: 20, padding: 10, backgroundColor: "#FBEAF2" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 8, color: "#65566F", textAlign: "center" },
});

function PartnerInvoicePdf({ inv, month, residencyName: residencyName }: { inv: ShownInvoice; month: string; residencyName: string }) {
  const sum = inv.summary;
  return (
    <Document title={`Invoice ${inv.number}`} author="Iris Music Project">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF image, not HTML */}
          <Image style={s.logo} src={path.join(process.cwd(), "public/brand/logo-horizontal-purple.png")} />
          <View>
            <Text style={s.title}>INVOICE</Text>
            {inv.state === "draft" && <Text style={s.draft}>DRAFT</Text>}
            <Text style={s.meta}>No. {inv.number}</Text>
            {inv.sentAt && <Text style={s.meta}>Date: {inv.sentAt.slice(0, 10)}</Text>}
          </View>
        </View>
        <View style={s.parties}>
          <View>
            <Text style={s.label}>From</Text>
            <Text>Iris Music Project</Text>
          </View>
          <View>
            <Text style={s.label}>Bill to</Text>
            {inv.billTo.split("\n").map((line, i) => <Text key={i}>{line}</Text>)}
          </View>
          <View>
            <Text style={s.label}>Period</Text>
            <Text>{formatInvoiceMonth(month)}</Text>
            <Text>{residencyName}</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={s.desc}>Description</Text>
            <Text style={s.qty}>Qty</Text>
            <Text style={s.rate}>Rate</Text>
            <Text style={s.amount}>Amount</Text>
          </View>
          {inv.lines.map((l, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.desc}>{l.description}</Text>
              <Text style={s.qty}>{l.quantity != null ? `${l.quantity} ${l.unit === "hours" ? "hrs" : l.unit ?? ""}` : ""}</Text>
              <Text style={s.rate}>{l.unit_amount != null ? money(Number(l.unit_amount)) : ""}</Text>
              <Text style={s.amount}>{money(Number(l.amount))}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL DUE</Text>
            <Text style={s.amount}>{money(inv.total)}</Text>
          </View>
        </View>
        <View style={s.progress}>
          <Text>
            Hours this month: {sum.hoursThisMonth} · Season to date: {sum.hoursToDate}
            {sum.contractedHours != null ? ` of ${sum.contractedHours} contracted` : ""}
          </Text>
        </View>
        <Text style={s.footer}>Thank you for partnering with Iris Music Project.</Text>
      </Page>
    </Document>
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (viewer.state !== "active" || !viewer.isAdmin) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const q = new URL(request.url).searchParams;
  const ym = q.get("month") ?? "";
  const agreementId = q.get("agreement") ?? "";
  const kind = q.get("kind") ?? "";
  const siteId = q.get("site");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{4}-\d{2}$/.test(ym) || !/^[0-9a-f-]{36}$/i.test(agreementId)) return new Response("Not found", { status: 404 });
  const month = `${ym}-01`;

  const supabase = await createClient();
  const [{ data: residency }, { data: siteRows }, { data: agreementRow }] = await Promise.all([
    supabase.from("residency").select("name").eq("id", id).maybeSingle(),
    supabase.from("residency_site").select("site(id, display_name)").eq("residency_id", id),
    supabase.from("partner_agreement").select("season_id, season(starts_on)").eq("id", agreementId).eq("residency_id", id).maybeSingle(),
  ]);
  if (!residency || !agreementRow) return new Response("Not found", { status: 404 });
  const agreement = (await getAgreements(id, agreementRow.season_id)).find((a) => a.id === agreementId);
  if (!agreement) return new Response("Not found", { status: 404 });
  const names = new Map((siteRows ?? []).map((r) => r.site as unknown as { id: string; display_name: string }).filter(Boolean).map((x) => [x.id, x.display_name]));
  const invoices = await loadPartnerInvoices(agreement, month, (agreementRow.season as unknown as { starts_on: string }).starts_on, names, await getBillTo(id));
  const inv = invoices.find((i) => i.kind === kind && i.siteId === (siteId || null));
  if (!inv) return new Response("Not found", { status: 404 });

  const pdf = await renderToBuffer(<PartnerInvoicePdf inv={inv} month={month} residencyName={residency.name} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${q.get("view") ? "inline" : "attachment"}; filename="Invoice ${inv.number}${inv.state === "draft" ? " DRAFT" : ""}.pdf"`,
    },
  });
}
