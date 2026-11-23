import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, type CancellationReason } from "@shared/domain/scheduling";
import { weekStart } from "@shared/domain/documentation";
import { todayIso } from "@/lib/week";
import { formatDay, formatTime, localDateTime } from "@shared/domain/time";
import { Button, Card, Choices, Field, LinkButton, Loading, Muted, Notice, Problem, Screen, Tag, styles } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { friendly, useWeek } from "@/lib/week-context";

// One date (Session): when and where, who's leading and playing (names,
// instruments and phone for the program's people, v0.13/v0.27), directions
// to the building, and a way to document it if I led it.

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
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string; address: string | null; city: string | null; state: string | null } | null } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
  session_report: { id: string } | null;
};

export default function DateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, setMonday } = useWeek();
  const [row, setRow] = useState<Row | null>(null);
  const [people, setPeople] = useState<Map<string, { name: string; phone: string | null; instruments: string[] }>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      const { data, error } = await supabase
        .from("session")
        .select(
          "id, residency_id, title, starts_at, has_set_time, scheduled_minutes, schedule_state, is_special_event, residency(name), location(site_id, display_name, site(display_name, timezone, address, city, state)), session_assignment(person_id, role, status), session_report(id)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) return setProblem(friendly(error));
      if (!data) return setProblem("This date wasn't found. It may have been removed.");
      const r = data as unknown as Row;
      setRow(r);
      const [{ data: names }, { data: contacts }] = await Promise.all([
        supabase.rpc("residency_people", { p_residency: r.residency_id }),
        supabase.rpc("residency_roster_contacts", { p_residency: r.residency_id }),
      ]);
      const map = new Map<string, { name: string; phone: string | null; instruments: string[] }>();
      for (const p of (names ?? []) as { id: string; name: string }[]) map.set(p.id, { name: p.name, phone: null, instruments: [] });
      for (const c of (contacts ?? []) as { person_id: string; phone: string | null; instruments: string[] }[]) {
        const cur = map.get(c.person_id);
        if (cur) map.set(c.person_id, { ...cur, phone: c.phone, instruments: c.instruments ?? [] });
      }
      setPeople(map);
    })();
  }, [id]);

  useEffect(load, [load]);

  if (problem) return <Screen><Problem>{problem}</Problem></Screen>;
  if (!row || !me) return <Loading />;

  const site = row.location?.site;
  const tz = site?.timezone ?? "America/New_York";
  const canceled = row.schedule_state === "canceled";
  const playing = row.session_assignment.filter((a) => a.status !== "absent").sort((a, b) => Number(b.role === "leader") - Number(a.role === "leader"));
  const iLead = playing.some((a) => a.person_id === me.id && a.role === "leader");
  const past = row.starts_at <= new Date().toISOString();
  const address = [site?.address, site?.city, site?.state].filter(Boolean).join(", ");

  return (
    <Screen>
      <Card>
        <View style={styles.row}>
          <Text style={{ fontSize: 21, fontWeight: "700", color: canceled ? colors.muted : colors.text, flex: 1 }}>{canceled ? `No Program (${row.title})` : row.title}</Text>
          {row.schedule_state === "draft" && <Tag label="Draft" />}
          {row.is_special_event && <Tag label="Special event" />}
        </View>
        <Text style={{ fontSize: 16, color: colors.text }}>
          {formatDay(row.starts_at, tz)}
          {row.has_set_time ? ` · ${formatTime(row.starts_at, tz)}` : " · No set time"}
          {row.has_set_time && row.scheduled_minutes ? ` · ${row.scheduled_minutes} min` : ""}
        </Text>
        <Muted>
          {[row.location?.display_name, site?.display_name].filter(Boolean).join(", ")}
          {row.residency?.name ? ` · ${row.residency.name}` : ""}
        </Muted>
        {address ? <LinkButton label="Directions" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site?.display_name ?? ""} ${address}`)}`)} /> : null}
      </Card>

      {!canceled && (
        <Card title="Who's playing">
          {playing.length === 0 && <Muted>No one assigned yet.</Muted>}
          {playing.map((a) => {
            const p = people.get(a.person_id);
            const mine = a.person_id === me.id;
            return (
              <View key={a.person_id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }}>
                <Text style={{ fontSize: 16, color: colors.text }}>
                  <Text style={{ fontWeight: "700" }}>{mine ? "You" : p?.name ?? "A colleague"}</Text>
                  {a.role === "leader" ? " · leading" : ""}
                  {a.status === "substitute" ? " · sub" : ""}
                </Text>
                {!!p?.instruments.length && <Muted>{p.instruments.join(", ")}</Muted>}
                {!mine && p?.phone && (
                  <View style={{ flexDirection: "row", gap: 20 }}>
                    <LinkButton label="Call" onPress={() => Linking.openURL(`tel:${p.phone!.replace(/[^\d+]/g, "")}`)} />
                    <LinkButton label="Text" onPress={() => Linking.openURL(`sms:${p.phone!.replace(/[^\d+]/g, "")}`)} />
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {message && <Notice>{message}</Notice>}
      {row.schedule_state === "draft" && !past && playing.some((a) => a.person_id === me.id) && (
        <Card title="Can't happen?">
          <Muted>Any musician playing a draft date can make it &ldquo;No Program&rdquo; until the month is reviewed. The point person gets an email. This can&apos;t be undone here.</Muted>
          <Field label="Reason">
            <Choices options={CANCELLATION_REASONS.map((r) => ({ value: r, label: CANCELLATION_REASON_LABELS[r] }))} selected={reason ?? ("" as CancellationReason)} onToggle={setReason} />
          </Field>
          <Button
            label="Make “No Program”"
            kind="danger"
            busy={busy}
            disabled={!reason}
            onPress={() =>
              Alert.alert("No Program", `Mark ${formatDay(row.starts_at, tz)} as “No Program”? This can't be undone here.`, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, No Program",
                  style: "destructive",
                  onPress: async () => {
                    setBusy(true);
                    const { error, count } = await supabase.from("session").update({ schedule_state: "canceled", cancellation_reason: reason }, { count: "exact" }).eq("id", row.id);
                    setBusy(false);
                    if (error) return setMessage(friendly(error));
                    if (!count) return setMessage("Only musicians playing the date (on drafts, until the month is reviewed), the admin lead, the point person or an admin can make it “No Program”.");
                    setMessage("Marked “No Program”.");
                    load();
                  },
                },
              ])
            }
          />
        </Card>
      )}

      {!canceled && localDateTime(row.starts_at, tz).date === todayIso() && playing.some((a) => a.person_id === me.id) && row.location && (
        <Button
          label={`Log relationship building at ${site?.display_name ?? "this building"}`}
          kind="secondary"
          onPress={() => {
            setMonday(weekStart(todayIso()));
            router.push({ pathname: "/log", params: { residencyId: row.residency_id, siteId: row.location!.site_id } });
          }}
        />
      )}

      {iLead && past && !canceled && (
        <Button
          label={row.session_report ? "View or update documentation" : "Document this program"}
          onPress={() => {
            setMonday(weekStart(localDateTime(row.starts_at, tz).date));
            router.navigate("/week");
          }}
        />
      )}
    </Screen>
  );
}
