import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS, addDays, residentsRequired, type ActivityKind } from "@shared/domain/documentation";
import { Button, Card, Choices, Field, Input, Loading, Muted, Notice, Problem, Screen, Stepper, TimeField } from "@/components/ui";
import { useOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/offline/store";
import { colors } from "@/lib/theme";
import { useWeek } from "@/lib/week-context";

// Log a relationship-building activity. Same fields and rules as the
// website's ActivityForm and logActivity (src/app/documentation): usual
// lengths per type (v0.21), "Same as last time", shared logs (v0.24), and at
// detailed-notes buildings a note, start and end time and each resident's
// room (v0.36). Program, site, type and date stay after each log so several
// one-to-ones in a row are quick. Works offline: each log goes into the
// outbox and is sent with one call that's safe to repeat (OFFLINE-SPEC).

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

export default function LogActivity() {
  const router = useRouter();
  // Opened from a date ("Log relationship building here"): start at that program and building.
  const from = useLocalSearchParams<{ residencyId?: string; siteId?: string }>();
  const { me, week } = useWeek();
  const outbox = useOutbox();
  const residencies = week?.residencies ?? [];
  const lengths = week?.lengths ?? {};
  const usual = (rid: string, k: ActivityKind) => (lengths[rid]?.[k] ? String(lengths[rid]![k]) : "");
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(week.monday, i)).filter((d) => d <= week.today) : [];

  const startResidency = residencies.find((p) => p.id === from.residencyId) ?? residencies[0];
  const [residencyId, setResidencyId] = useState(startResidency?.id ?? "");
  const residency = residencies.find((p) => p.id === residencyId);
  const [siteId, setSiteId] = useState(residency?.sites.find((x) => x.id === from.siteId)?.id ?? residency?.sites[0]?.id ?? "");
  const [kind, setKind] = useState<ActivityKind>("one_to_one");
  const [minutes, setMinutes] = useState(usual(residencyId, "one_to_one"));
  const [date, setDate] = useState(days[days.length - 1] ?? "");
  const [collab, setCollab] = useState<"no" | "yes">("no");
  const [picked, setPicked] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [newNames, setNewNames] = useState("");
  const [newRooms, setNewRooms] = useState<string[]>([]);
  const [withIds, setWithIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [logged, setLogged] = useState<{ text: string; state: "sent" | "saved" | "needs_attention" }[]>([]);
  const [search, setSearch] = useState("");

  if (!week || !me) return <Loading />;
  if (!residencies.length) return <Screen><Muted>You&apos;re not on a program&apos;s roster for this week.</Muted></Screen>;
  if (!days.length) return <Screen><Muted>Activities are logged after they happen. Pick this week or an earlier one.</Muted></Screen>;

  const site = residency?.sites.find((x) => x.id === siteId);
  const detailed = !!site?.detailed_relationship_notes;
  const siteResidents = week.residents.filter((r) => r.siteId === siteId);
  const newList = newNames.split(",").map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);
  const start = startTime || null;
  const end = endTime || null;
  const span = start && end ? toMin(end)! - toMin(start)! : null;
  const colleagues = week.colleagues[residencyId] ?? [];
  const last = week.last;
  const lastUsable = last && residencies.some((p) => p.id === last.residencyId && p.sites.some((x) => x.id === last.siteId));

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    const e: Record<string, string> = {};
    const mins = detailed ? span ?? NaN : Number(minutes);
    if (!residencyId || !siteId) e.site = "Pick a program and site.";
    if (!date) e.date = "Pick the date.";
    if (detailed) {
      if (!start) e.start = "Pick the start time.";
      if (!end) e.end = "Pick the end time.";
      else if (start && mins < 1) e.end = "The end must be after the start.";
      else if (mins > 600) e.end = "A visit can be at most 10 hours.";
      if (!note.trim()) e.note = "Write a note for the partner.";
    } else if (!Number.isInteger(mins) || mins < 1 || mins > 600) e.minutes = "Enter minutes (1–600).";
    if (newList.some((n) => n.length > 80)) e.newResidents = "Keep each name short: first name and last initial.";
    if (residentsRequired(kind) && !picked.length && !newList.length) e.residents = "Pick or add at least one resident.";
    const pickedRooms = picked.map((id) => ({ id, room: (rooms[id] ?? siteResidents.find((r) => r.id === id)?.room ?? "").trim() }));
    const addedRooms = newList.map((_, i) => (newRooms[i] ?? "").trim());
    if (detailed && (pickedRooms.some((r) => !r.room) || addedRooms.some((r) => !r))) e.rooms = "Enter a room number for each resident.";
    if (detailed && [...pickedRooms.map((r) => r.room), ...addedRooms].some((r) => r.length > 30)) e.rooms = "Keep room numbers short.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    setProblem(null);
    // New residents (first name + last initial, D14). Reuse one already on the list.
    const existing = [...pickedRooms.map((r) => ({ id: r.id, room: detailed ? r.room : null }))];
    const added: { id: string; name: string; disambiguator: string; room: string | null }[] = [];
    for (const [i, name] of newList.entries()) {
      const room = detailed ? addedRooms[i] : null;
      const found = siteResidents.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (found) {
        if (!existing.some((r) => r.id === found.id)) existing.push({ id: found.id, room });
      } else added.push({ id: newId(), name, disambiguator: "", room });
    }
    const payload = {
      p_id: newId(),
      p_residency: residencyId,
      p_site: siteId,
      p_occurred_on: date,
      p_kind: kind,
      p_minutes: mins,
      p_collaborative: collab === "yes",
      p_note: note.trim() || null,
      p_start_time: detailed ? start : null,
      p_end_time: detailed ? end : null,
      p_residents: existing,
      p_new_residents: added,
      // Other musicians who shared it (v0.24): each is credited the minutes.
      p_shared_with: withIds.filter((id) => id !== me!.id),
    };
    const who = [...picked.map((id) => siteResidents.find((r) => r.id === id)?.name ?? ""), ...newList].filter(Boolean);
    const summary = `${ACTIVITY_KIND_LABELS[kind].replace(/ \(.*\)$/, "")}${who.length ? ` with ${who.join(", ")}` : ""}, ${mins} min, ${short(date)}`;
    const { result, problem: why } = await outbox.add("activity", payload, summary);
    setBusy(false);
    if (result === "no_storage" || result === "needs_attention") {
      if (result === "needs_attention") setLogged((cur) => [...cur, { text: summary, state: "needs_attention" }]);
      return setProblem(why ?? "We couldn't do that. Please try again.");
    }
    // Logged (or saved on the phone): clear who and how long; keep program, site, type and date.
    setLogged((cur) => [...cur, { text: summary, state: result }]);
    setSearch("");
    setPicked([]);
    setRooms({});
    setNewNames("");
    setNewRooms([]);
    setWithIds([]);
    setCollab("no");
    setMinutes(usual(residencyId, kind));
    setStartTime("");
    setEndTime("");
    setNote("");
  }

  return (
    <Screen>
      {lastUsable && (
        <Button
          label="Same as last time"
          kind="secondary"
          onPress={() => {
            setResidencyId(last!.residencyId);
            setSiteId(last!.siteId);
            setKind(last!.kind);
            setMinutes(String(last!.minutes));
            setCollab(last!.collaborative ? "yes" : "no");
            setPicked(last!.residentIds);
          }}
        />
      )}
      {residencies.length > 1 && (
        <Field label="Program">
          <Choices
            options={residencies.map((p) => ({ value: p.id, label: p.name }))}
            selected={residencyId}
            onToggle={(v) => {
              setResidencyId(v);
              setSiteId(residencies.find((p) => p.id === v)?.sites[0]?.id ?? "");
              setMinutes(usual(v, kind));
              setPicked([]);
              setWithIds([]);
            }}
          />
        </Field>
      )}
      <Field label="Site" error={errors.site}>
        <Choices
          options={(residency?.sites ?? []).map((x) => ({ value: x.id, label: x.display_name }))}
          selected={siteId}
          onToggle={(v) => {
            setSiteId(v);
            setPicked([]);
          }}
        />
      </Field>
      <Field label="Date" error={errors.date}>
        <Choices options={days.map((d) => ({ value: d, label: d === week.today ? "Today" : short(d) }))} selected={date} onToggle={setDate} />
      </Field>
      <Field label="Type">
        <Choices
          options={ACTIVITY_KINDS.map((k) => ({ value: k, label: ACTIVITY_KIND_LABELS[k] }))}
          selected={kind}
          onToggle={(k) => {
            setKind(k);
            if (usual(residencyId, k)) setMinutes(usual(residencyId, k));
          }}
        />
      </Field>
      {detailed ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Start time" error={errors.start}>
              <TimeField value={startTime} onChange={setStartTime} placeholder="Start" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="End time" error={errors.end} hint={span != null ? (span > 0 ? `${span} minutes` : "Must be after the start") : undefined}>
              <TimeField value={endTime} onChange={setEndTime} placeholder="End" />
            </Field>
          </View>
        </View>
      ) : (
        <Field label="Minutes" error={errors.minutes}>
          <Stepper value={minutes} onChange={setMinutes} step={5} min={5} />
          <Choices
            options={[...new Set([usual(residencyId, kind), "15", "30", "45", "60"].filter(Boolean))].map((m) => ({ value: m, label: `${m} min` }))}
            selected={minutes}
            onToggle={setMinutes}
          />
        </Field>
      )}
      <Field label="Collab?">
        <Choices
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
          selected={collab}
          onToggle={setCollab}
        />
      </Field>

      <Field label={`Residents${residentsRequired(kind) ? "" : " (optional for hallway concerts)"}`} error={errors.residents}>
        {siteResidents.length > 10 && <Input value={search} onChangeText={setSearch} placeholder="Find a resident" autoCapitalize="words" autoCorrect={false} />}
        {siteResidents.length > 0 ? (
          <Choices
            options={siteResidents
              .filter((r) => picked.includes(r.id) || !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
              .sort((a, b) => Number(picked.includes(b.id)) - Number(picked.includes(a.id)))
              .map((r) => ({ value: r.id, label: r.name }))}
            selected={picked}
            onToggle={(v) => setPicked((cur) => toggle(cur, v))}
          />
        ) : (
          <Muted>No residents at this site yet. Add them below.</Muted>
        )}
      </Field>
      <Field
        label={siteResidents.length ? "Someone new? Add them" : "Add residents"}
        hint="First name and last initial, separated by commas, e.g. “Ruth K., Sam P.”. No health information."
        error={errors.newResidents}
      >
        <Input value={newNames} onChangeText={setNewNames} autoCapitalize="words" />
      </Field>
      {detailed && (picked.length > 0 || newList.length > 0) && (
        <Card title="Room numbers">
          <Muted>Saved with each resident and filled in next time. Change it if they&apos;ve moved.</Muted>
          {errors.rooms && <Problem>{errors.rooms}</Problem>}
          {picked.map((id) => {
            const r = siteResidents.find((x) => x.id === id);
            if (!r) return null;
            return (
              <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{r.name}</Text>
                <Input style={{ flex: 1 }} value={rooms[id] ?? r.room ?? ""} onChangeText={(v) => setRooms((cur) => ({ ...cur, [id]: v }))} placeholder="Room" maxLength={30} />
              </View>
            );
          })}
          {newList.map((n, i) => (
            <View key={`${i}-${n}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{n} (new)</Text>
              <Input
                style={{ flex: 1 }}
                value={newRooms[i] ?? ""}
                onChangeText={(v) => setNewRooms((cur) => Object.assign([...cur], { [i]: v }))}
                placeholder="Room"
                maxLength={30}
              />
            </View>
          ))}
        </Card>
      )}

      {colleagues.length > 0 && (
        <Field label="Other musicians (optional)" hint="Did someone else do this with you? Add them: they're credited the same minutes, and you document it once.">
          <Choices options={colleagues.map((c) => ({ value: c.id, label: c.label }))} selected={withIds} onToggle={(v) => setWithIds((cur) => toggle(cur, v))} />
        </Field>
      )}

      {detailed ? (
        <Field label="Note for the partner" hint="A few sentences on what you did together; goes in the day's document for this site. No health information." error={errors.note}>
          <Input value={note} onChangeText={setNote} multiline maxLength={3000} />
        </Field>
      ) : (
        <Field label="One-sentence note (optional)" hint="No health information.">
          <Input value={note} onChangeText={setNote} maxLength={500} />
        </Field>
      )}

      {problem && <Problem>{problem}</Problem>}
      {logged.length > 0 && !busy && (
        <Card>
          <Notice>
            {logged.every((l) => l.state === "sent")
              ? `✓ Logged${logged.length === 1 ? "" : ` ${logged.length} activities`}`
              : "Saved on this phone. It sends by itself when you're back online."}
          </Notice>
          {logged.map((l, i) => (
            <Muted key={i}>
              {l.state === "sent" ? "✓ " : l.state === "saved" ? "Saved on this phone: " : "Needs attention: "}
              {l.text}
            </Muted>
          ))}
          <Muted>Date and site are kept for the next one.</Muted>
        </Card>
      )}
      <Button label={logged.length ? "Log another" : "Log activity"} onPress={save} busy={busy} />
      {logged.length > 0 && <Button label="Done" kind="secondary" onPress={() => router.back()} />}
    </Screen>
  );
}
