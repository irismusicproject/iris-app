import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, type CancellationReason } from "@shared/domain/scheduling";
import { weekStart } from "@shared/domain/documentation";
import { todayIso } from "@/lib/week";
import { formatDay, formatTime, localDateTime, zonedToUtc } from "@shared/domain/time";
import { Button, Card, Choices, Field, Input, LinkButton, Loading, Muted, Notice, Problem, Screen, Tag, TimeField, styles } from "@/components/ui";
import { notifySoon, plain, STAGE_LABEL, type Stage } from "@/lib/month";
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
  const [stage, setStage] = useState<Stage | null>(null);
  const [isLead, setIsLead] = useState(false);
  const [points, setPoints] = useState<{ name: string; phone: string | null }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; display_name: string }[]>([]);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [pick, setPick] = useState<string>("");
  const [subPick, setSubPick] = useState<string>("");
  const [openSwap, setOpenSwap] = useState(false);
  const [reviewed, setReviewed] = useState(false);

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
      setTitle(r.title);
      const tz = r.location?.site?.timezone ?? "America/New_York";
      setTime(r.has_set_time ? localDateTime(r.starts_at, tz).time.slice(0, 5) : "");
      // The month's stage, my role, the point person's phone, the building's rooms.
      const monthStart = `${localDateTime(r.starts_at, tz).date.slice(0, 7)}-01`;
      const [{ data: sm }, { data: lead }, { data: staff }, { data: dir }, { data: locs }, { data: swaps }, { data: exp }] = await Promise.all([
        supabase.from("schedule_month").select("stage").eq("residency_id", r.residency_id).eq("site_id", r.location?.site_id ?? "").eq("month", monthStart).maybeSingle(),
        supabase.rpc("is_current_admin_lead", { p_residency: r.residency_id }),
        supabase.from("staff_assignment").select("person_id, starts_on, ends_on").eq("residency_id", r.residency_id).eq("role", "point_person"),
        supabase.rpc("staff_directory"),
        supabase.from("location").select("id, display_name").eq("site_id", r.location?.site_id ?? "").order("display_name"),
        supabase.from("change_request").select("id").eq("session_id", r.id).eq("status", "open").eq("requested_by", me?.id ?? ""),
        // Reviewed (or confirmed): a calendar version exists, as the website checks (v0.35, v0.46).
        supabase.from("calendar_export").select("id").eq("residency_id", r.residency_id).eq("site_id", r.location?.site_id ?? "").eq("month", monthStart).limit(1),
      ]);
      setStage((sm?.stage as Stage | undefined) ?? null);
      setReviewed(((exp ?? []) as unknown[]).length > 0);
      setIsLead(!!lead);
      const today = todayIso(); // the phone's own date, not UTC
      const pp = ((staff ?? []) as { person_id: string; starts_on: string; ends_on: string | null }[]).filter((x) => x.starts_on <= today && (!x.ends_on || x.ends_on >= today));
      const d = (dir ?? []) as { person_id: string; name: string; phone: string | null }[];
      setPoints(pp.map((x) => d.find((y) => y.person_id === x.person_id) ?? { name: map.get(x.person_id)?.name ?? "the point person", phone: null }));
      setRooms((locs ?? []) as { id: string; display_name: string }[]);
      setRoster(((names ?? []) as { id: string; name: string }[]).filter((p) => !r.session_assignment.some((a) => a.person_id === p.id && a.status !== "absent")));
      setOpenSwap(((swaps ?? []) as unknown[]).length > 0);
    })();
  }, [id, me?.id]);

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
  const mine = row.session_assignment.find((a) => a.person_id === me.id);
  const iPlay = !!mine && mine.status !== "absent";
  const teamEditing = stage === "team_editing";
  // Same as the website (session-card.tsx): a month not opened through the
  // cycle and not yet reviewed still lets the date's leader set its title.
  const titleWindow = teamEditing || (!stage && !reviewed);
  const isToday = localDateTime(row.starts_at, tz).date === todayIso();
  const canEditTitle = !canceled && ((titleWindow && iLead && row.schedule_state === "draft") || (isLead && (stage === "sent_to_partner" || stage === "partner_changes")));
  const partnerChange = !canceled && isLead && (stage === "sent_to_partner" || stage === "partner_changes");
  const canMarkOff = !canceled && teamEditing && row.schedule_state === "draft" && !!mine && mine.status !== "substitute";
  const swapOptions = playing.filter((a) => a.role !== "leader");
  const canSwap = !canceled && teamEditing && row.schedule_state === "draft" && iPlay && playing.some((a) => a.role === "leader") && swapOptions.length > 0;
  const afterFinal = !canceled && stage === "final" && iPlay && !past;
  const canCallPoint = !canceled && iPlay && row.schedule_state !== "draft" && (isToday || !past) && points.length > 0;
  const leaderAbsent = !canceled && past && iPlay && !row.session_report && !playing.some((a) => a.role === "leader");

  async function act(fn: () => Promise<{ error: { code?: string; message?: string } | null }>, done: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMessage(plain(error));
    setMessage(done);
    notifySoon();
    load();
  }

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

      {stage && <Muted>{formatDay(row.starts_at, tz).split(",")[0]}&apos;s month: {STAGE_LABEL[stage]}</Muted>}

      {canEditTitle && (
        <Card title="Title">
          <Muted>{teamEditing ? "You lead this date, so you add its title (without musicians' names: the calendar adds “with …”)." : "Partner change: the next calendar version shows it."}</Muted>
          <Input value={title} onChangeText={setTitle} maxLength={200} placeholder="This date's title" />
          <Button
            label="Save title"
            busy={busy}
            disabled={!title.trim() || title.trim() === row.title}
            onPress={() => act(async () => await supabase.from("session").update({ title: title.trim() }).eq("id", row.id), "Title saved.")}
          />
        </Card>
      )}

      {partnerChange && (
        <Card title="Partner change: time and room">
          {row.has_set_time && (
            <Field label="Time">
              <TimeField value={time} onChange={setTime} placeholder="Pick the time" />
            </Field>
          )}
          {row.has_set_time && (
            <Button
              label="Save time"
              kind="secondary"
              busy={busy}
              disabled={!time || time === localDateTime(row.starts_at, tz).time.slice(0, 5)}
              onPress={() => act(async () => await supabase.from("session").update({ starts_at: zonedToUtc(localDateTime(row.starts_at, tz).date, time, tz) }).eq("id", row.id), "Time saved.")}
            />
          )}
          {rooms.length > 1 && (
            <Field label="Room">
              <Choices
                options={rooms.map((x) => ({ value: x.id, label: x.display_name }))}
                selected={row.location ? (rooms.find((x) => x.display_name === row.location!.display_name)?.id ?? "") : ""}
                onToggle={(v) => act(async () => await supabase.from("session").update({ location_id: v }).eq("id", row.id), "Room saved.")}
              />
            </Field>
          )}
        </Card>
      )}

      {canMarkOff && (
        <Card title="Can you play?">
          <Muted>Mark dates you can&apos;t play while the month is open for the team. The point person is told right away and finds cover. Sick or snowed in on the day? Call them instead.</Muted>
          <Button
            label={mine?.status === "absent" ? "Marked: I can't play (tap to undo)" : "I can't play this date"}
            kind={mine?.status === "absent" ? "primary" : "secondary"}
            busy={busy}
            onPress={async () => {
              setBusy(true);
              const { data, error } = await supabase.rpc("set_unavailable", { p_session: row.id, p_unavailable: mine?.status !== "absent" });
              setBusy(false);
              if (error) return setMessage(plain(error));
              setMessage(mine?.status === "absent" ? "Undone: you're playing it again." : `Marked. ${data} date${data === 1 ? "" : "s"} you can't play this season.`);
              notifySoon();
              load();
            }}
          />
        </Card>
      )}

      {canSwap && (
        <Card title="Leader">
          {openSwap ? (
            <Muted>You&apos;ve proposed a leader swap for this date. The point person approves or declines it.</Muted>
          ) : (
            <>
              <Muted>Propose someone else playing this date as its leader. The point person approves it.</Muted>
              <Choices options={swapOptions.map((a) => ({ value: a.person_id, label: people.get(a.person_id)?.name.split(" ")[0] ?? "A colleague" }))} selected={pick} onToggle={setPick} />
              <Button
                label="Send to the point person"
                kind="secondary"
                busy={busy}
                disabled={!pick}
                onPress={() => act(async () => await supabase.rpc("request_leader_swap", { p_session: row.id, p_person: pick }), "Sent to the point person for approval.")}
              />
            </>
          )}
        </Card>
      )}

      {afterFinal && (
        <Card title="Need a sub?">
          <Muted>This month is final, so the point person approves every change. Pick who&apos;ll play for you.</Muted>
          <Choices options={roster.map((p) => ({ value: p.id, label: p.name }))} selected={subPick} onToggle={setSubPick} />
          <Button
            label="Ask the point person"
            kind="secondary"
            busy={busy}
            disabled={!subPick}
            onPress={() => act(async () => await supabase.rpc("request_change", { p_session: row.id, p_kind: "sub", p_person: subPick }), "Sent to the point person for approval.")}
          />
        </Card>
      )}

      {canCallPoint && (
        <Card title="Canceling today?">
          <Muted>Same-day cancellations (illness, weather) are a phone call to the point person. Afterwards, the leader marks it &ldquo;Canceled day-of&rdquo; when documenting.</Muted>
          {points.map((p) =>
            p.phone ? (
              <Button key={p.name} label={`Call ${p.name.split(" ")[0]}`} onPress={() => Linking.openURL(`tel:${p.phone!.replace(/[^\d+]/g, "")}`)} />
            ) : (
              <Muted key={p.name}>Call {p.name}; their number isn&apos;t in the app yet.</Muted>
            ),
          )}
        </Card>
      )}

      {leaderAbsent && (
        <Button
          label="Document it (the leader wasn't there)"
          onPress={async () => {
            const { error } = await supabase.rpc("take_lead_to_document", { p_session: row.id });
            if (error) return setMessage(plain(error));
            setMonday(weekStart(localDateTime(row.starts_at, tz).date));
            router.push({ pathname: "/document/[id]", params: { id: row.id } });
          }}
        />
      )}

      {/* Hidden once the month is reviewed, as on the website: the database refuses it then. */}
      {row.schedule_state === "draft" && !past && !reviewed && playing.some((a) => a.person_id === me.id) && (
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
          onPress={async () => {
            setMonday(weekStart(localDateTime(row.starts_at, tz).date));
            router.push({ pathname: "/document/[id]", params: { id: row.id } });
          }}
        />
      )}
    </Screen>
  );
}
