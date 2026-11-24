import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { weekStart } from "@shared/domain/documentation";
import { Button, Card, Loading, Muted, Notice, Problem, Screen, Tag } from "@/components/ui";
import { dueLabel, myTasks, notifySoon, plain, REMINDER, type Task } from "@/lib/month";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { todayIso } from "@/lib/week";
import { useWeek } from "@/lib/week-context";

// To do (DOMAIN-MODEL v0.41): every task with its deadline and when its
// email reminder goes out, soonest first. The database works out the list
// (my_tasks), so the website shows the same one. One tap opens or does it.

const CTA: Record<Task["kind"], string> = {
  open_month: "Open it for the team",
  titles: "Add titles",
  confirm: "Review and confirm",
  cover: "Open the date",
  approve: "",
  send: "Send calendar to partner",
  partner_changes: "Open the calendar",
  finalize: "Mark final and send",
  document: "Document",
  submit_week: "Open my week",
};

export default function Todo() {
  const router = useRouter();
  const { me, setMonday } = useWeek();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await myTasks());
      setProblem(null);
    } catch (e) {
      setProblem(plain(e as { message?: string }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!me || (!tasks && !problem)) return <Loading />;

  const key = (t: Task, i: number) => `${t.kind}-${t.session_id ?? ""}-${t.request_id ?? ""}-${t.site_id ?? ""}-${i}`;
  const overdue = (t: Task) => t.due_on < todayIso();

  async function run(k: string, fn: () => Promise<{ error: { code?: string; message?: string } | null }>, done: string) {
    setBusy(k);
    setMessage(null);
    const { error } = await fn();
    setBusy(null);
    if (error) return setProblem(plain(error));
    setProblem(null);
    setMessage(done);
    notifySoon();
    load();
  }

  function open(t: Task, k: string) {
    switch (t.kind) {
      case "open_month":
        return Alert.alert("Open the month", `${t.title}? The musicians playing get an email to add titles and mark dates they can't play.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Open it", onPress: () => run(k, async () => await supabase.rpc("open_schedule_month", { p_residency: t.residency_id!, p_site: null as unknown as string, p_month: t.month! }), "Opened for the team. The musicians playing have been emailed.") },
        ]);
      case "titles":
      case "partner_changes":
        return router.navigate({ pathname: "/calendar", params: { month: t.month!.slice(0, 7) } });
      case "confirm":
        return router.push({ pathname: "/month-review", params: { residencyId: t.residency_id!, siteId: t.site_id!, month: t.month!.slice(0, 7) } });
      case "send":
      case "finalize":
        return router.push({ pathname: "/month-send", params: { residencyId: t.residency_id!, siteId: t.site_id!, month: t.month!.slice(0, 7), action: t.kind === "send" ? "send" : "finalize" } });
      case "cover":
        return router.push({ pathname: "/date/[id]", params: { id: t.session_id! } });
      case "document":
        return (async () => {
          const { data } = await supabase.from("session").select("starts_at, location(site(timezone))").eq("id", t.session_id!).maybeSingle();
          const tz = (data as unknown as { location: { site: { timezone: string } | null } | null } | null)?.location?.site?.timezone ?? "America/New_York";
          const day = data ? new Date(data.starts_at).toLocaleDateString("en-CA", { timeZone: tz }) : todayIso();
          setMonday(weekStart(day));
          router.push({ pathname: "/document/[id]", params: { id: t.session_id! } });
        })();
      case "submit_week":
        return router.push("/week");
      default:
        return undefined;
    }
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
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.iris }}>Hi, {me.name.trim().split(/\s+/)[0]}</Text>
      <Muted>{tasks?.length ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"} to do, soonest first.` : "Nothing to do right now."}</Muted>
      {problem && <Problem>{problem}</Problem>}
      {message && <Notice>{message}</Notice>}
      {tasks?.map((t, i) => {
        const k = key(t, i);
        return (
          <Card key={k}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text, flex: 1 }}>{t.title}</Text>
              <Tag label={`${overdue(t) ? "Was due" : "Due"} ${dueLabel(t.due_on)}`} tone="todo" />
            </View>
            {t.detail ? <Muted>{t.detail}</Muted> : null}
            {t.kind === "approve" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Approve" busy={busy === k} onPress={() => run(k, async () => await supabase.rpc("decide_change_request", { p_request: t.request_id!, p_approve: true }), "Approved. They've been emailed.")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Decline"
                    kind="secondary"
                    onPress={() =>
                      Alert.alert("Decline this request?", "They'll get an email saying it was declined.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Decline", style: "destructive", onPress: () => run(k, async () => await supabase.rpc("decide_change_request", { p_request: t.request_id!, p_approve: false }), "Declined. They've been emailed.") },
                      ])
                    }
                  />
                </View>
              </View>
            ) : (
              <Button label={CTA[t.kind]} kind={t.kind === "partner_changes" || t.kind === "cover" ? "secondary" : "primary"} busy={busy === k} onPress={() => open(t, k)} />
            )}
            <Muted>✉ {REMINDER[t.kind]}</Muted>
          </Card>
        );
      })}
      {tasks && tasks.length === 0 && (
        <Card>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>All done for now</Text>
          <Muted>New tasks appear here with their deadline, and you get an email before each one is due.</Muted>
        </Card>
      )}
    </Screen>
  );
}
