import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { addDays, weekStart } from "@shared/domain/documentation";
import { formatDay, formatTime, localDateTime } from "@shared/domain/time";
import { lastUpdated } from "@/components/offline";
import { Card, LinkButton, Loading, Muted, Notice, Problem, Screen, Tag, styles } from "@/components/ui";
import { notifySoon, plain } from "@/lib/month";
import { isNetworkError, useOutbox } from "@/lib/offline/outbox";
import { cacheGet, cacheSet } from "@/lib/offline/store";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { todayIso } from "@/lib/week";
import { friendly, useWeek } from "@/lib/week-context";

// Today (DOMAIN-MODEL v0.41): the dates I play, today first, then the next
// four weeks, in each building's own time zone. Today's dates carry their
// actions: Document (the leader), Log relationship building, and "I wasn't
// there" for a musician who missed a program that went on. Canceled dates
// show as "No Program", the same words as the calendars.

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
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string } | null } | null;
  mine: { role: "leader" | "participant"; status: string }[];
  everyone: { person_id: string; role: "leader" | "participant"; status: string }[];
};

const DAYS_AHEAD = 28;

export default function Upcoming() {
  const router = useRouter();
  const { me, week, setMonday } = useWeek();
  const [message, setMessage] = useState<string | null>(null);
  const outbox = useOutbox();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const from = new Date(`${addDays(todayIso(), -1)}T00:00:00Z`).toISOString();
    const to = new Date(`${addDays(todayIso(), DAYS_AHEAD + 1)}T00:00:00Z`).toISOString();
    const { data, error } = await supabase
      .from("session")
      .select(
        "id, residency_id, title, starts_at, has_set_time, scheduled_minutes, schedule_state, is_special_event, residency(name), location(site_id, display_name, site(display_name, timezone)), mine:session_assignment!inner(role, status), everyone:session_assignment(person_id, role, status)",
      )
      .eq("mine.person_id", me.id)
      .neq("mine.status", "absent")
      .eq("kind", "group_session")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at");
    if (error) {
      // No signal: show the copy kept on the phone.
      const saved = isNetworkError(error) ? await cacheGet<{ rows: Row[]; names: Map<string, string> }>("upcoming") : null;
      if (!saved) return setProblem(friendly(error));
      setRows(saved.value.rows.filter((r) => localDateTime(r.starts_at, r.location?.site?.timezone ?? "America/New_York").date >= todayIso()));
      setNames(saved.value.names);
      setCachedAt(saved.savedAt);
      return setProblem(null);
    }
    setCachedAt(null);
    const list = (data ?? []) as unknown as Row[];
    // Today's dates stay all day (to log relationship building after), then earlier days drop off.
    const upcoming = list.filter((r) => localDateTime(r.starts_at, r.location?.site?.timezone ?? "America/New_York").date >= todayIso());
    setRows(upcoming);
    setProblem(null);
    // Names of the other musicians (names only, DOMAIN-MODEL v0.13).
    const map = new Map<string, string>();
    for (const rid of new Set(upcoming.map((r) => r.residency_id))) {
      const { data: people } = await supabase.rpc("residency_people", { p_residency: rid });
      for (const p of (people ?? []) as { id: string; name: string }[]) map.set(p.id, p.name);
    }
    setNames(map);
    cacheSet("upcoming", { rows: upcoming, names: map });
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!me || (!rows && !problem)) return <Loading />;

  const toDocument = week ? week.ledPast.filter((s) => !s.session_report && !outbox.items.some((i) => i.kind === "report" && i.payload.session_id === s.id)).length : 0;

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
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.iris }}>Today</Text>
      {message && <Notice>{message}</Notice>}
      {toDocument > 0 && (
        <Pressable onPress={() => router.navigate("/todo")} accessibilityRole="button">
          <Card>
            <Text style={{ color: colors.orange, fontSize: 16, fontWeight: "700" }}>
              {toDocument} program{toDocument === 1 ? "" : "s"} to document →
            </Text>
            <Muted>You led {toDocument === 1 ? "it" : "them"} this week. It&apos;s in To do.</Muted>
          </Card>
        </Pressable>
      )}
      <Pressable onPress={() => router.push("/week")} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Card>
          <Text style={{ color: colors.iris, fontSize: 16, fontWeight: "700" }}>My week →</Text>
          <Muted>Hours and Submit my week, relationship building, the monthly reflection.</Muted>
        </Card>
      </Pressable>
      {cachedAt && <Muted>{lastUpdated(cachedAt)}</Muted>}
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
                {!canceled && date === todayIso() && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18 }}>
                    {iLead && r.starts_at <= new Date().toISOString() && (
                      <LinkButton
                        label="Document"
                        onPress={() => {
                          setMonday(weekStart(todayIso()));
                          router.push({ pathname: "/document/[id]", params: { id: r.id } });
                        }}
                      />
                    )}
                    <LinkButton
                      label="Log relationship building"
                      onPress={() => {
                        setMonday(weekStart(todayIso()));
                        router.push({ pathname: "/log", params: { residencyId: r.residency_id, siteId: r.location?.site_id ?? "" } });
                      }}
                    />
                    {!iLead && r.starts_at <= new Date().toISOString() && (
                      <LinkButton
                        label="I wasn't there"
                        onPress={() =>
                          Alert.alert("I wasn't there", `The program went on without you? You won't be paid for it, and the point person is told.`, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Yes, I wasn't there",
                              onPress: async () => {
                                const { error } = await supabase.rpc("mark_not_there", { p_session: r.id, p_not_there: true });
                                if (error) return setMessage(plain(error));
                                setMessage(`Marked: you weren't at ${r.title}. The point person has been told.`);
                                notifySoon();
                                load();
                              },
                            },
                          ])
                        }
                      />
                    )}
                  </View>
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
