import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addDays } from "@shared/domain/documentation";
import { formatDay, formatTime, localDateTime } from "@shared/domain/time";
import { Card, Loading, Muted, Problem, Screen, Tag, styles } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { todayIso } from "@/lib/week";
import { friendly, useWeek } from "@/lib/week-context";

// Upcoming: the dates I play in the next four weeks, in each building's own
// time zone, with who's leading and who else is playing. Canceled dates show
// as "No Program", the same words as the calendars.

type Row = {
  id: string;
  residency_id: string;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  scheduled_minutes: number | null;
  schedule_state: "draft" | "published" | "canceled";
  is_special_event: boolean;
  residency: { name: string } | null;
  location: { display_name: string; site: { display_name: string; timezone: string } | null } | null;
  mine: { role: "leader" | "participant"; status: string }[];
  everyone: { person_id: string; role: "leader" | "participant"; status: string }[];
};

const DAYS_AHEAD = 28;

export default function Upcoming() {
  const router = useRouter();
  const { me, week } = useWeek();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    const from = new Date(`${addDays(todayIso(), -1)}T00:00:00Z`).toISOString();
    const to = new Date(`${addDays(todayIso(), DAYS_AHEAD + 1)}T00:00:00Z`).toISOString();
    const { data, error } = await supabase
      .from("session")
      .select(
        "id, residency_id, title, starts_at, has_set_time, scheduled_minutes, schedule_state, is_special_event, residency(name), location(display_name, site(display_name, timezone)), mine:session_assignment!inner(role, status), everyone:session_assignment(person_id, role, status)",
      )
      .eq("mine.person_id", me.id)
      .neq("mine.status", "absent")
      .eq("kind", "group_session")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at");
    if (error) return setProblem(friendly(error));
    const list = (data ?? []) as unknown as Row[];
    // Drop anything that already happened today (in the building's time).
    const now = new Date().toISOString();
    const upcoming = list.filter((r) => {
      const tz = r.location?.site?.timezone ?? "America/New_York";
      return r.starts_at >= now || (!r.has_set_time && localDateTime(r.starts_at, tz).date >= todayIso());
    });
    setRows(upcoming);
    setProblem(null);
    // Names of the other musicians (names only, DOMAIN-MODEL v0.13).
    const map = new Map<string, string>();
    for (const rid of new Set(upcoming.map((r) => r.residency_id))) {
      const { data: people } = await supabase.rpc("residency_people", { p_residency: rid });
      for (const p of (people ?? []) as { id: string; name: string }[]) map.set(p.id, p.name);
    }
    setNames(map);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!me || (!rows && !problem)) return <Loading />;

  const toDocument = week ? week.ledPast.filter((s) => !s.session_report).length : 0;
  const first = me.name.trim().split(/\s+/)[0];

  // Group by the building's local date.
  const groups = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    const tz = r.location?.site?.timezone ?? "America/New_York";
    const key = localDateTime(r.starts_at, tz).date;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.iris }}>Hi, {first}</Text>
      {toDocument > 0 && (
        <Pressable onPress={() => router.navigate("/week")} accessibilityRole="button">
          <Card>
            <Text style={{ color: colors.orange, fontSize: 16, fontWeight: "700" }}>
              {toDocument} program{toDocument === 1 ? "" : "s"} to document →
            </Text>
            <Muted>You led {toDocument === 1 ? "it" : "them"} this week. Tap to document.</Muted>
          </Card>
        </Pressable>
      )}
      <Pressable onPress={() => router.push("/review")} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Card>
          <Text style={{ color: colors.iris, fontSize: 16, fontWeight: "700" }}>Review next month&apos;s dates →</Text>
          <Muted>Check your draft dates at each building, then tap Done reviewing.</Muted>
        </Card>
      </Pressable>
      {problem && <Problem>{problem}</Problem>}
      {rows && rows.length === 0 && <Muted>Nothing scheduled for you in the next four weeks.</Muted>}
      {[...groups.entries()].map(([date, list]) => (
        <View key={date} style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {date === todayIso() ? "Today" : formatDay(list[0].starts_at, list[0].location?.site?.timezone ?? "America/New_York")}
          </Text>
          {list.map((r) => {
            const tz = r.location?.site?.timezone ?? "America/New_York";
            const canceled = r.schedule_state === "canceled";
            const leader = r.everyone.find((a) => a.role === "leader" && a.status !== "absent");
            const others = r.everyone.filter((a) => a.person_id !== me.id && a.person_id !== leader?.person_id && a.status !== "absent").map((a) => (names.get(a.person_id) ?? "").split(" ")[0]).filter(Boolean);
            const iLead = r.mine.some((a) => a.role === "leader");
            return (
              <Pressable key={r.id} onPress={() => router.push({ pathname: "/date/[id]", params: { id: r.id } })} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
              <Card>
                <View style={styles.row}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: canceled ? colors.muted : colors.text, flex: 1 }}>
                    {canceled ? `No Program (${r.title})` : r.title}
                  </Text>
                  {r.schedule_state === "draft" && <Tag label="Draft" />}
                  {r.is_special_event && <Tag label="Special event" />}
                </View>
                <Text style={{ fontSize: 15, color: colors.text }}>
                  {r.has_set_time ? formatTime(r.starts_at, tz) : "No set time"}
                  {r.has_set_time && r.scheduled_minutes ? ` · ${r.scheduled_minutes} min` : ""}
                </Text>
                <Muted>
                  {[r.location?.display_name, r.location?.site?.display_name].filter(Boolean).join(", ")}
                  {r.residency?.name ? ` · ${r.residency.name}` : ""}
                </Muted>
                {!canceled && (
                  <Muted>
                    {iLead ? "You're leading" : leader ? `Led by ${(names.get(leader.person_id) ?? "").split(" ")[0] || "a colleague"}` : "No leader yet"}
                    {others.length ? ` · with ${others.join(", ")}` : ""}
                  </Muted>
                )}
              </Card>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
