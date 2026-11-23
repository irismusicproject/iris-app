import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { formatDay, formatMonth, formatTime, localDateTime, monthWindow, shiftMonth } from "@shared/domain/time";
import { Button, Card, LinkButton, Loading, Muted, Notice, Problem, Screen, Tag, styles } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { todayIso } from "@/lib/week";
import { friendly, useWeek } from "@/lib/week-context";

// Review my dates in a draft month, building by building, then tap "Done
// reviewing" (v0.35), the same as on the website's month view. The point
// person sees who is done. Once the month is marked reviewed, drafts lock for
// musicians. The database decides who may do what.

type Row = {
  id: string;
  residency_id: string;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  schedule_state: "draft" | "published" | "canceled";
  is_special_event: boolean;
  residency: { name: string } | null;
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string } | null } | null;
  mine: { role: "leader" | "participant"; status: string }[];
};
type Group = { key: string; residencyId: string; siteId: string; program: string; building: string; rows: Row[]; checked: boolean; locked: boolean };

export default function Review() {
  const router = useRouter();
  const { me } = useWeek();
  const [month, setMonth] = useState(shiftMonth(todayIso().slice(0, 7), 1));
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const w = monthWindow(month);
    const { data, error } = await supabase
      .from("session")
      .select("id, residency_id, title, starts_at, has_set_time, schedule_state, is_special_event, residency(name), location(site_id, display_name, site(display_name, timezone)), mine:session_assignment!inner(role, status)")
      .eq("mine.person_id", me.id)
      .neq("mine.status", "absent")
      .eq("kind", "group_session")
      .gte("starts_at", w.from)
      .lt("starts_at", w.to)
      .order("starts_at");
    if (error) return setProblem(friendly(error));
    const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.location && localDateTime(r.starts_at, r.location.site?.timezone ?? "America/New_York").date.startsWith(month));
    const byKey = new Map<string, Group>();
    for (const r of rows) {
      const key = `${r.residency_id}|${r.location!.site_id}`;
      if (!byKey.has(key))
        byKey.set(key, { key, residencyId: r.residency_id, siteId: r.location!.site_id, program: r.residency?.name ?? "", building: r.location!.site?.display_name ?? "", rows: [], checked: false, locked: false });
      byKey.get(key)!.rows.push(r);
    }
    const list = [...byKey.values()];
    await Promise.all(
      list.map(async (g) => {
        const [{ data: check }, { data: exports }] = await Promise.all([
          supabase.from("schedule_check").select("id").eq("person_id", me.id).eq("residency_id", g.residencyId).eq("site_id", g.siteId).eq("month", `${month}-01`).maybeSingle(),
          supabase.from("calendar_export").select("id").eq("residency_id", g.residencyId).eq("site_id", g.siteId).eq("month", `${month}-01`).limit(1),
        ]);
        g.checked = !!check;
        g.locked = (exports ?? []).length > 0;
      }),
    );
    setGroups(list.sort((a, b) => a.building.localeCompare(b.building)));
    setProblem(null);
  }, [me, month]);

  useFocusEffect(
    useCallback(() => {
      setGroups(null);
      load();
    }, [load]),
  );

  async function toggle(g: Group) {
    setBusy(g.key);
    setMessage(null);
    const args = { p_residency: g.residencyId, p_site: g.siteId, p_month: `${month}-01` };
    const { data, error } = g.checked ? await supabase.rpc("undo_schedule_checked", args) : await supabase.rpc("mark_schedule_checked", args);
    setBusy(null);
    if (error) {
      if (error.message.includes("already been reviewed")) setProblem("The point person has already marked this month reviewed. Ask them for any changes.");
      else if (error.message.includes("aren't playing")) setProblem("You aren't playing at this building this month.");
      else setProblem(friendly(error));
    } else {
      setProblem(null);
      setMessage(g.checked ? `Undone for ${g.building}.` : data ? `Done for ${g.building}. Everyone playing there is done, so the point person will get an email.` : `Done for ${g.building}. The point person can see you've checked your dates.`);
    }
    load();
  }

  if (!me) return <Loading />;

  return (
    <Screen
      onRefresh={load}
    >
      <View style={styles.row}>
        <LinkButton label="← Previous" onPress={() => setMonth(shiftMonth(month, -1))} />
        <LinkButton label="Next →" onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{formatMonth(month)}</Text>
      <Muted>
        Check your dates at each building: titles, rooms, times and who&apos;s playing. Tap a date to see it, or to make a draft date &ldquo;No Program&rdquo;. Edit titles,
        rooms and musicians on the website. Then tap Done reviewing.
      </Muted>
      {problem && <Problem>{problem}</Problem>}
      {message && <Notice>{message}</Notice>}
      {!groups && !problem && <Loading />}
      {groups && groups.length === 0 && <Muted>You have no dates in {formatMonth(month)} yet.</Muted>}
      {groups?.map((g) => {
        const drafts = g.rows.some((r) => r.schedule_state === "draft");
        return (
          <Card key={g.key} title={g.building}>
            <Muted>{g.program}</Muted>
            {g.locked ? <Tag label="Reviewed by the point person" /> : g.checked ? <Tag label="You're done reviewing" /> : drafts ? <Tag label="To review" tone="todo" /> : null}
            {g.rows.map((r) => {
              const tz = r.location?.site?.timezone ?? "America/New_York";
              const canceled = r.schedule_state === "canceled";
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push({ pathname: "/date/[id]", params: { id: r.id } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }, pressed && styles.pressed]}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: canceled ? colors.muted : colors.text }}>
                    {formatDay(r.starts_at, tz)}
                    {r.has_set_time ? ` · ${formatTime(r.starts_at, tz)}` : ""}
                  </Text>
                  <Muted>
                    {canceled ? `No Program (${r.title})` : r.title} · {r.location?.display_name}
                    {r.mine.some((a) => a.role === "leader") ? " · you lead" : ""}
                    {r.schedule_state === "published" ? " · published" : ""}
                  </Muted>
                </Pressable>
              );
            })}
            {drafts && !g.locked && (
              <Button
                label={g.checked ? "Undo done reviewing" : "Done reviewing"}
                kind={g.checked ? "secondary" : "primary"}
                busy={busy === g.key}
                onPress={() =>
                  g.checked
                    ? toggle(g)
                    : Alert.alert("Done reviewing", `Tell the point person your ${formatMonth(month)} dates at ${g.building} look right?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Yes, done", onPress: () => toggle(g) },
                      ])
                }
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
