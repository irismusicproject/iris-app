import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ACTIVITY_KIND_LABELS, addDays, dueLabel, formatWeek, weekStart } from "@shared/domain/documentation";
import { formatDay, formatMonth, formatTime, formatTimeRange } from "@shared/domain/time";
import { Button, Card, LinkButton, Loading, Muted, Notice, Problem, Screen, Tag, styles } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { siteTimezone, todayIso } from "@/lib/week";
import { friendly, useWeek } from "@/lib/week-context";

// My week: the same sections as the website's My week, stacked for a phone.
// Programs I led (to document), relationship building, hours and submit, and
// the month's reflection. Due Tuesday 5 pm the following week (D7).

const kindLabel = (k: keyof typeof ACTIVITY_KIND_LABELS) => ACTIVITY_KIND_LABELS[k].replace(/ \(.*\)$/, "");
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

export default function MyWeek() {
  const router = useRouter();
  const { me, monday, setMonday, week, loading, problem, reload } = useWeek();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Fresh numbers every time the tab is opened.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!me || (!week && !problem)) return <Loading />;
  if (!week) return <Screen onRefresh={reload}>{problem && <Problem>{problem}</Problem>}</Screen>;

  const today = todayIso();
  const toDo = week.ledPast.filter((s) => !s.session_report);
  const activityMinutes = week.activities.reduce((n, a) => n + a.minutes, 0);
  const programName = (id: string) => week.programs.find((p) => p.id === id)?.name ?? "";
  const nameOf = (rid: string, pid: string) => week.names.get(rid)?.get(pid) ?? "a colleague";
  const open = week.hours.filter((h) => h.state !== "submitted" && h.state !== "approved");
  const sum = (h: { hours: { hours: number }[] }) => h.hours.reduce((n, x) => n + x.hours, 0);
  const total = open.reduce((n, h) => n + sum(h), 0);

  function removeActivity(id: string, mine: boolean, label: string) {
    Alert.alert(mine ? "Delete this activity?" : "Take yourself off this log?", label, [
      { text: "Cancel", style: "cancel" },
      {
        text: mine ? "Yes, delete" : "Yes",
        style: "destructive",
        onPress: async () => {
          setBusy(id);
          const { error } = mine
            ? await supabase.from("relationship_activity").delete().eq("id", id)
            : await supabase.from("relationship_activity_musician").delete().eq("activity_id", id).eq("person_id", me!.id);
          setBusy(null);
          setMessage(error ? friendly(error) : null);
          reload();
        },
      },
    ]);
  }

  function submitWeek() {
    Alert.alert("Submit my week", `Submit your documentation and ${total.toFixed(2)} hours for this week?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, submit",
        onPress: async () => {
          setBusy("submit");
          let msg = "Your week is submitted to the point person.";
          for (const h of open) {
            const { error } = await supabase.rpc("submit_week", { p_residency: h.residencyId, p_week: week!.monday });
            if (error) {
              if (error.message.includes("already approved")) continue;
              msg = error.message.includes("document the programs") ? "Document the programs you led this week first, then submit your week." : friendly(error);
              break;
            }
          }
          setBusy(null);
          setMessage(msg);
          reload();
        },
      },
    ]);
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.row}>
        <LinkButton label="← Previous" onPress={() => setMonday(addDays(monday, -7))} />
        {monday !== weekStart(today) && <LinkButton label="This week" onPress={() => setMonday(weekStart(today))} />}
        <LinkButton label="Next →" onPress={() => setMonday(addDays(monday, 7))} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{formatWeek(week.monday)}</Text>
        <Tag label={`Due ${dueLabel(week.monday)}`} />
        <Muted>
          {toDo.length > 0 ? `${toDo.length} program${toDo.length === 1 ? "" : "s"} to document · ` : ""}
          {week.activities.length} relationship-building activit{week.activities.length === 1 ? "y" : "ies"}, {activityMinutes} min
        </Muted>
      </View>
      {problem && <Problem>{problem}</Problem>}
      {message && <Notice>{message}</Notice>}

      {week.programs.length === 0 && <Muted>You&apos;re not on a program&apos;s roster for this week.</Muted>}

      {week.programs.length > 0 && (
        <>
          <Card title="Programs you led">
            {week.progress.map((p) => (
              <Tag key={p.id} label={`Collaborative programs this season${week.programs.length > 1 ? ` (${p.name})` : ""}: ${p.done} of ${p.target}`} />
            ))}
            <Muted>As leader, you document each one: attendance (everyone present), type and collaboration.</Muted>
            {week.ledPast.length === 0 && <Muted>None this week{week.ledFuture.length ? " yet" : ""}.</Muted>}
            {week.ledPast.map((s) => {
              const tz = siteTimezone(week, s);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: "/document/[id]", params: { id: s.id } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 4 }, pressed && styles.pressed]}
                >
                  <View style={styles.row}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, flex: 1 }}>{s.title}</Text>
                    <Tag label={s.session_report ? "Documented" : "To document"} tone={s.session_report ? "soft" : "todo"} />
                  </View>
                  <Muted>
                    {formatDay(s.starts_at, tz)}
                    {s.has_set_time ? ` · ${formatTime(s.starts_at, tz)}` : ""} · {s.location?.display_name}
                  </Muted>
                  <Text style={{ color: colors.iris, fontWeight: "600" }}>{s.session_report ? "View or update →" : "Document →"}</Text>
                </Pressable>
              );
            })}
            {week.ledFuture.length > 0 && (
              <View style={{ gap: 6 }}>
                <Muted>Later this week (document after they happen):</Muted>
                {week.ledFuture.map((s) => (
                  <LinkButton key={s.id} label={`${s.title}, ${formatDay(s.starts_at, siteTimezone(week, s))}`} onPress={() => router.push({ pathname: "/date/[id]", params: { id: s.id } })} />
                ))}
              </View>
            )}
            {week.playedNotLed > 0 && (
              <Muted>
                You also played in {week.playedNotLed} program{week.playedNotLed === 1 ? "" : "s"} led by someone else; the leader documents those.
              </Muted>
            )}
          </Card>

          <Card title="Relationship building">
            {week.activities.length === 0 && <Muted>Nothing logged this week yet.</Muted>}
            {week.activities.map((a) => {
              const names = a.relationship_activity_resident
                .map((x) => x.resident && (x.room ? `${x.resident.display_name} (Room ${x.room})` : x.resident.display_name))
                .filter(Boolean)
                .join(", ");
              const others = [a.person_id, ...a.relationship_activity_musician.map((m) => m.person_id)].filter((id) => id !== me.id);
              const mine = a.person_id === me.id;
              const label = `${kindLabel(a.kind)}, ${shortDate(a.occurred_on)}`;
              return (
                <View key={a.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 4 }}>
                  <Text style={{ fontSize: 15, color: colors.text }}>
                    <Text style={{ fontWeight: "700" }}>{shortDate(a.occurred_on)}</Text> · {kindLabel(a.kind)}
                    {names ? ` · ${names}` : ""}
                  </Text>
                  <Muted>
                    {formatTimeRange(a.start_time, a.end_time) ? `${formatTimeRange(a.start_time, a.end_time)} · ` : ""}
                    {a.minutes} min · Collab: {a.collaborative ? "Yes" : "No"}
                    {others.length ? ` · with ${others.map((id) => nameOf(a.residency_id, id).split(" ")[0]).join(", ")}` : ""}
                  </Muted>
                  <Muted>
                    {programName(a.residency_id)} · {week.siteById.get(a.site_id)?.display_name}
                    {a.note ? ` · ${a.note}` : ""}
                  </Muted>
                  <View style={{ alignSelf: "flex-start" }}>
                    <LinkButton label={busy === a.id ? "Removing…" : mine ? "Delete" : "Not me"} onPress={() => removeActivity(a.id, mine, label)} />
                  </View>
                </View>
              );
            })}
            {week.monday <= today && <Button label="Log an activity" onPress={() => router.push("/log")} />}
          </Card>

          <Card title="Hours and submit">
            <Muted>
              Your timesheet for this week, calculated from your documentation: the programs you played, special events, and your relationship building. To change a
              number, fix the documentation, then submit your week in one step.
            </Muted>
            {week.hours.map((h) => (
              <View key={h.residencyId} style={{ gap: 8 }}>
                {week.hours.length > 1 && <Text style={{ fontWeight: "700", color: colors.text }}>{h.programName}</Text>}
                {h.returnedNote && h.state === "draft" && (
                  <Text style={{ color: colors.text, borderWidth: 1, borderColor: colors.orange, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontWeight: "700" }}>Sent back by the point person: </Text>
                    {h.returnedNote}
                  </Text>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {h.hours.map((x) => (
                    <View key={x.name} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, minWidth: 96, flexGrow: 1 }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{x.name}</Text>
                      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{x.hours.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.row, { justifyContent: "flex-start", flexWrap: "wrap" }]}>
                  <Text style={{ color: colors.text }}>
                    Total: <Text style={{ fontWeight: "700" }}>{sum(h).toFixed(2)} hours</Text>
                  </Text>
                  <Tag label={h.state === "approved" ? "Approved" : h.state === "submitted" ? "Submitted, waiting for approval" : "Not submitted yet"} />
                </View>
              </View>
            ))}
            {open.length > 0 && (
              <>
                {toDo.length > 0 && (
                  <Text style={{ color: colors.orange }}>
                    Before you submit, document: {toDo.map((s) => `${s.title} (${formatDay(s.starts_at, siteTimezone(week, s))})`).join(", ")}.
                  </Text>
                )}
                <Button label="Submit my week" onPress={submitWeek} busy={busy === "submit"} disabled={toDo.length > 0} />
              </>
            )}
          </Card>

          {week.programs.map((p) => {
            const r = week.reflections.get(p.id);
            const started = !!(r?.highlights || r?.challenges);
            return (
              <Card key={p.id} title={`${formatMonth(week.month)} reflection${week.programs.length > 1 ? `: ${p.name}` : ""}`}>
                <Muted>Fill in any time this month; it&apos;s due with the last week&apos;s documentation.</Muted>
                {started && <Muted numberOfLines={2}>{r!.highlights || r!.challenges}</Muted>}
                <Button
                  label={started ? "Edit reflection" : "Write reflection"}
                  kind="secondary"
                  onPress={() => router.push({ pathname: "/reflection", params: { residencyId: p.id } })}
                />
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
