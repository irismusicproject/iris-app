import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { formatDay, formatMonth, formatTime, localDateTime, monthWindow } from "@shared/domain/time";
import { Button, Card, Loading, Muted, Notice, Problem, Screen } from "@/components/ui";
import { plain } from "@/lib/month";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Review and confirm [month] (Iris Supervisor; DOMAIN-MODEL v0.41): the team's
// version at one building, week by week, with what still needs attention.
// Confirming locks the dates for musicians; the Lead Musician then sends it.

type Row = {
  id: string;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  schedule_state: "draft" | "published" | "canceled";
  series: { title: string } | null;
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string } | null } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: string }[];
};

export default function MonthReview() {
  const router = useRouter();
  const { residencyId, siteId, month } = useLocalSearchParams<{ residencyId: string; siteId: string; month: string }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [swaps, setSwaps] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = monthWindow(month);
    const [{ data, error }, { data: people }, { data: sm }] = await Promise.all([
      supabase
        .from("session")
        .select("id, title, starts_at, has_set_time, schedule_state, series(title), location(site_id, display_name, site(display_name, timezone)), session_assignment(person_id, role, status)")
        .eq("residency_id", residencyId)
        .eq("kind", "group_session")
        .gte("starts_at", w.from)
        .lt("starts_at", w.to)
        .order("starts_at"),
      supabase.rpc("residency_people", { p_residency: residencyId }),
      supabase.from("schedule_month").select("stage").eq("residency_id", residencyId).eq("site_id", siteId).eq("month", `${month}-01`).maybeSingle(),
    ]);
    if (error) return setProblem(plain(error));
    const list = ((data ?? []) as unknown as Row[]).filter((r) => r.location?.site_id === siteId && localDateTime(r.starts_at, r.location.site?.timezone ?? "America/New_York").date.startsWith(month));
    setRows(list);
    setNames(new Map(((people ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])));
    setStage(sm?.stage ?? null);
    const { data: open } = await supabase.from("change_request").select("session_id").eq("status", "open").in("session_id", list.map((r) => r.id));
    setSwaps(new Set(((open ?? []) as { session_id: string }[]).map((x) => x.session_id)));
  }, [residencyId, siteId, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (problem && !rows) return <Screen><Problem>{problem}</Problem></Screen>;
  if (!rows) return <Loading />;

  const first = (id: string) => (names.get(id) ?? "").split(" ")[0] || "someone";
  const flags = (r: Row) => {
    const out: string[] = [];
    if (r.schedule_state === "canceled") return out;
    if (r.series && r.title === r.series.title) out.push("Still the usual title");
    if (!r.session_assignment.some((a) => a.role === "leader" && a.status !== "absent")) out.push("No leader");
    for (const a of r.session_assignment.filter((x) => x.status === "absent")) out.push(`${first(a.person_id)} can't play`);
    if (swaps.has(r.id)) out.push("Leader swap waiting");
    return out;
  };
  const weeks = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(`${localDateTime(r.starts_at, r.location?.site?.timezone ?? "America/New_York").date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    weeks.set(k, [...(weeks.get(k) ?? []), r]);
  }
  const flagged = rows.filter((r) => flags(r).length).length;
  const building = rows[0]?.location?.site?.display_name ?? "this building";

  return (
    <Screen onRefresh={load}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>Review {formatMonth(month)}</Text>
      <Muted>{building} · the team&apos;s version. {flagged ? `${flagged} date${flagged === 1 ? "" : "s"} need${flagged === 1 ? "s" : ""} a look.` : "Nothing flagged."}</Muted>
      {problem && <Problem>{problem}</Problem>}
      {message && <Notice>{message}</Notice>}
      {[...weeks.entries()].map(([wk, list]) => (
        <Card key={wk} title={`Week of ${formatDay(`${wk}T12:00:00Z`, "UTC", false)}`}>
          {list.map((r) => {
            const tz = r.location?.site?.timezone ?? "America/New_York";
            const leader = r.session_assignment.find((a) => a.role === "leader" && a.status !== "absent");
            const f = flags(r);
            return (
              <Pressable key={r.id} onPress={() => router.push({ pathname: "/date/[id]", params: { id: r.id } })} accessibilityRole="button" style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                  {formatDay(r.starts_at, tz)}
                  {r.has_set_time ? ` · ${formatTime(r.starts_at, tz)}` : ""} · {r.schedule_state === "canceled" ? (r.title === "No Program" ? "No Program" : `No Program (${r.title})`) : r.title}
                </Text>
                <Muted>
                  Leads: {leader ? first(leader.person_id) : "nobody yet"} · {r.location?.display_name}
                </Muted>
                {f.length > 0 && <Text style={{ color: colors.orange, fontWeight: "600" }}>{f.join(" · ")}</Text>}
              </Pressable>
            );
          })}
        </Card>
      ))}
      {stage === "team_editing" ? (
        <Button
          label={`Confirm the team's ${formatMonth(month).split(" ")[0]}`}
          busy={busy}
          onPress={() =>
            Alert.alert("Confirm", `${flagged ? `${flagged} date${flagged === 1 ? " is" : "s are"} still flagged. ` : ""}Confirming locks the dates for musicians; the Lead Musician then sends it to the partner.`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Confirm",
                onPress: async () => {
                  setBusy(true);
                  const { error } = await supabase.rpc("confirm_schedule_month", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` });
                  setBusy(false);
                  if (error) return setProblem(plain(error));
                  setMessage("Confirmed. Dates are locked for musicians; the Lead Musician can send it to the partner.");
                  load();
                },
              },
            ])
          }
        />
      ) : stage === "team_confirmed" ? (
        <View style={{ gap: 8 }}>
          <Notice>Confirmed. The Lead Musician sends it to the partner on the 10th.</Notice>
          <Button
            label="Undo confirm"
            kind="secondary"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              const { error } = await supabase.rpc("undo_confirm_schedule_month", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` });
              setBusy(false);
              if (error) return setProblem(plain(error));
              setMessage("Reopened for the team.");
              load();
            }}
          />
        </View>
      ) : (
        <Muted>{stage ? "This month has already gone to the partner." : "This month isn't open for the team yet."}</Muted>
      )}
    </Screen>
  );
}
