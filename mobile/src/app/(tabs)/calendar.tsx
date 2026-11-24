import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDay, formatMonth, formatTime, localDateTime, monthWindow, shiftMonth } from "@shared/domain/time";
import { Card, LinkButton, Loading, Muted, Problem, Screen, Tag, styles } from "@/components/ui";
import { plain, STAGE_HELP, STAGE_LABEL, STAGES, type ScheduleMonth } from "@/lib/month";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { todayIso } from "@/lib/week";
import { useWeek } from "@/lib/week-context";

// Calendar (DOMAIN-MODEL v0.41): one month at a glance, building by
// building, with the month's stage. Tap a date for details: its leader adds
// its title while the team edits, and anyone playing marks "I can't play" or
// proposes a leader swap there.

type Row = {
  id: string;
  residency_id: string;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  schedule_state: "draft" | "published" | "canceled";
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string } | null } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: string }[];
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Calendar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const { me } = useWeek();
  const [month, setMonth] = useState(params.month ?? todayIso().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [months, setMonths] = useState<ScheduleMonth[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (params.month) setMonth(params.month);
  }, [params.month]);

  const load = useCallback(async () => {
    const w = monthWindow(month);
    const [{ data, error }, { data: sm }] = await Promise.all([
      supabase
        .from("session")
        .select("id, residency_id, title, starts_at, has_set_time, schedule_state, location(site_id, display_name, site(display_name, timezone)), session_assignment(person_id, role, status)")
        .eq("kind", "group_session")
        .gte("starts_at", w.from)
        .lt("starts_at", w.to)
        .order("starts_at"),
      supabase.from("schedule_month").select("id, residency_id, site_id, month, stage, team_due_on, final_due_on").eq("month", `${month}-01`),
    ]);
    if (error) return setProblem(plain(error));
    setRows(((data ?? []) as unknown as Row[]).filter((r) => r.location && localDateTime(r.starts_at, r.location.site?.timezone ?? "America/New_York").date.startsWith(month)));
    setMonths((sm ?? []) as ScheduleMonth[]);
    setProblem(null);
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      load();
    }, [load]),
  );

  if (!me) return <Loading />;

  const plays = (r: Row) => r.session_assignment.some((a) => a.person_id === me.id && a.status !== "absent");
  const cantPlay = (r: Row) => r.session_assignment.some((a) => a.person_id === me.id && a.status === "absent");
  const localDate = (r: Row) => localDateTime(r.starts_at, r.location?.site?.timezone ?? "America/New_York").date;

  // Buildings this month, with their stage.
  const buildings = new Map<string, { name: string; residencyId: string; stage: ScheduleMonth | null; rows: Row[] }>();
  for (const r of rows ?? []) {
    const k = `${r.residency_id}|${r.location!.site_id}`;
    if (!buildings.has(k)) buildings.set(k, { name: r.location!.site?.display_name ?? "", residencyId: r.residency_id, stage: months.find((m) => m.residency_id === r.residency_id && m.site_id === r.location!.site_id) ?? null, rows: [] });
    buildings.get(k)!.rows.push(r);
  }

  // The month grid: a dot on days with a date I play; orange where I can't play.
  const first = new Date(`${month}-01T12:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: ({ day: number; mine: boolean; off: boolean } | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const here = (rows ?? []).filter((r) => localDate(r) === iso);
    cells.push({ day: d, mine: here.some(plays), off: here.some(cantPlay) });
  }
  while (cells.length % 7) cells.push(null);

  return (
    <Screen onRefresh={load}>
      <View style={styles.row}>
        <LinkButton label="← Previous" onPress={() => setMonth(shiftMonth(month, -1))} />
        <LinkButton label="Next →" onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{formatMonth(month)}</Text>
      {problem && <Problem>{problem}</Problem>}
      {!rows && !problem && <Loading />}

      {rows && (
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`h${i}`} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "700", color: colors.muted, paddingVertical: 4 }}>{w}</Text>
            ))}
            {cells.map((c, i) => (
              <View key={i} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: c?.off ? "#FDF3E7" : c?.mine ? colors.irisSoft : "transparent" }}>
                <Text style={{ fontSize: 14, fontWeight: c?.mine || c?.off ? "700" : "400", color: c?.off ? colors.orange : c?.mine ? colors.iris : colors.text }}>{c?.day ?? ""}</Text>
              </View>
            ))}
          </View>
          <Muted>Purple: you play · Orange: you can&apos;t play</Muted>
        </Card>
      )}

      {rows && rows.length === 0 && <Muted>No dates in {formatMonth(month)} yet.</Muted>}

      {[...buildings.values()].map((b) => {
        const stageIndex = b.stage ? STAGES.indexOf(b.stage.stage) : -1;
        return (
          <Card key={`${b.residencyId}${b.name}`} title={b.name}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {STAGES.map((s, i) => (
                <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= stageIndex ? colors.iris : colors.border }} />
              ))}
            </View>
            <Text style={{ fontWeight: "700", color: colors.text }}>{b.stage ? `Stage ${stageIndex + 1} of 5: ${STAGE_LABEL[b.stage.stage]}` : "Not open for the team yet"}</Text>
            <Muted>{b.stage ? STAGE_HELP[b.stage.stage] : "The point person opens the month for the team about the 1st of the month before."}</Muted>
            {b.rows.map((r) => {
              const tz = r.location?.site?.timezone ?? "America/New_York";
              const canceled = r.schedule_state === "canceled";
              const leader = r.session_assignment.find((a) => a.role === "leader" && a.status !== "absent");
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push({ pathname: "/date/[id]", params: { id: r.id } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }, pressed && styles.pressed]}
                >
                  <View style={styles.row}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: canceled ? colors.muted : colors.text, flex: 1 }}>
                      {formatDay(r.starts_at, tz)}
                      {r.has_set_time ? ` · ${formatTime(r.starts_at, tz)}` : ""}
                    </Text>
                    {cantPlay(r) && <Tag label="You can't play" tone="todo" />}
                    {!cantPlay(r) && plays(r) && <Tag label={leader?.person_id === me.id ? "You lead" : "You play"} />}
                  </View>
                  <Muted>
                    {canceled ? `No Program (${r.title})` : r.title} · {r.location?.display_name}
                  </Muted>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </Screen>
  );
}
