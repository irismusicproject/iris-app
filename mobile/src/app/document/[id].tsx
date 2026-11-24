import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import type { ResidentInvolvement } from "@shared/domain/documentation";
import { formatDay, formatTime } from "@shared/domain/time";
import { Button, Card, Choices, Field, Input, LinkButton, Loading, Muted, Notice, Problem, Screen, Stepper } from "@/components/ui";
import { isNetworkError, useOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/offline/store";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { siteTimezone } from "@/lib/week";
import { friendly, useWeek } from "@/lib/week-context";

// Document a program the musician led (SessionReport). Same fields and rules
// as the website's ReportRow: attendance (everyone present, D15), type,
// Collab? Yes/No (every Yes is stored as co_led, v0.19), length only if it
// ran longer or shorter (v0.20), optional notes, and the building when the
// program has more than one (v0.24).

export default function DocumentSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, week, reload } = useWeek();
  const outbox = useOutbox();
  const queued = outbox.items.find((i) => i.kind === "report" && i.payload.session_id === id);
  const s = week?.ledPast.find((x) => x.id === id);
  const program = week?.programs.find((p) => p.id === s?.residency_id);
  const r = s?.session_report ?? null;
  const scheduled = s?.scheduled_minutes ?? 45;

  const [attendance, setAttendance] = useState(r ? String(r.attendance) : "");
  const [typeId, setTypeId] = useState(r?.interaction_type_id ?? s?.series?.default_interaction_type_id ?? "");
  const [involvement, setInvolvement] = useState<ResidentInvolvement>(r?.resident_involvement ?? "none");
  const [editLength, setEditLength] = useState(!!r && r.actual_minutes !== scheduled);
  const [minutes, setMinutes] = useState(String(r?.actual_minutes ?? scheduled));
  const [notes, setNotes] = useState(r?.notes ?? "");
  const [siteId, setSiteId] = useState(r?.site_id ?? s?.location?.site_id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!week || !me) return <Loading />;
  if (!s || !program) return <Screen><Muted>This program isn&apos;t in the week you&apos;re looking at. Go back to My week.</Muted></Screen>;
  const tz = siteTimezone(week, s);

  async function save() {
    const e: Record<string, string> = {};
    const att = Number(attendance);
    const mins = editLength ? Number(minutes) : scheduled;
    if (!attendance.trim() || !Number.isInteger(att) || att < 0 || att > 2000) e.attendance = "Enter how many people attended.";
    if (!typeId) e.type = "Pick a type.";
    if (!Number.isInteger(mins) || mins < 1 || mins > 600) e.minutes = "Enter the length in minutes.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setProblem(null);
    const report = {
      session_id: s!.id,
      author_id: me!.id,
      attendance: att,
      interaction_type_id: typeId,
      resident_involvement: involvement,
      actual_minutes: mins,
      notes: notes.trim() || null,
      // The building it happened in (v0.24); the database checks it's one of the program's.
      site_id: siteId || null,
    };
    if (!r) {
      // A new report works offline: saved on the phone, sent when there's signal.
      const { result, problem: why } = await outbox.add("report", { id: newId(), ...report }, `${s!.title}, ${formatDay(s!.starts_at, tz)}: ${att} attended`);
      setBusy(false);
      if (result === "no_storage" || result === "needs_attention") return setProblem(why ?? "We couldn't do that. Please try again.");
      setSaved(true);
      if (result === "saved") return; // stays on screen with "Saved on this phone"
      router.back();
      return;
    }
    // Changing a report already sent needs a connection (OFFLINE-SPEC O11).
    const { error } = await supabase.from("session_report").upsert(report, { onConflict: "session_id" });
    setBusy(false);
    if (error) return setProblem(isNetworkError(error) ? "No connection. Changing a report that's already sent needs signal; try again when you're back online." : friendly(error));
    setSaved(true);
    await reload();
    router.back();
  }

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{s.title}</Text>
        <Muted>
          {formatDay(s.starts_at, tz)}
          {s.has_set_time ? ` · ${formatTime(s.starts_at, tz)}` : ""} · {program.name} · {s.location?.display_name}
        </Muted>
      </Card>

      {program.sites.length > 1 && (
        <Field label="Building" hint="Where the program happened. Attendance and billing count it here.">
          <Choices options={program.sites.map((x) => ({ value: x.id, label: x.display_name }))} selected={siteId} onToggle={setSiteId} />
        </Field>
      )}
      <Field label="Attendance" hint="Everyone present." error={errors.attendance}>
        <Stepper value={attendance} onChange={setAttendance} />
      </Field>
      <Field label="Type" error={errors.type}>
        <Choices options={week.types.map((t) => ({ value: t.id, label: t.label }))} selected={typeId} onToggle={setTypeId} />
      </Field>
      <Field label="Collab?">
        <Choices
          options={[
            { value: "none", label: "No" },
            { value: "co_led", label: "Yes" },
          ]}
          selected={involvement === "none" ? "none" : "co_led"}
          onToggle={(v) => setInvolvement(v as ResidentInvolvement)}
        />
      </Field>
      {editLength ? (
        <Field label="How long it actually ran (minutes)" error={errors.minutes}>
          <Stepper value={minutes} onChange={setMinutes} step={5} min={5} />
          <LinkButton
            label={`Use the usual ${scheduled} min`}
            onPress={() => {
              setEditLength(false);
              setMinutes(String(scheduled));
            }}
          />
        </Field>
      ) : (
        <Field label={`Length: ${scheduled} min`}>
          <LinkButton label="Ran longer or shorter?" onPress={() => setEditLength(true)} />
        </Field>
      )}
      <Field label="Notes (optional)" hint="Music and group engagement only. No health information.">
        <Input value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </Field>
      {problem && <Problem>{problem}</Problem>}
      {queued ? (
        <Notice>{queued.state === "saved" ? "Saved on this phone. It sends by itself when you're back online." : `Needs attention: ${queued.problem ?? ""} See My week.`}</Notice>
      ) : (
        <>
          {saved && <Notice>Saved.</Notice>}
          <Button label={r ? "Update" : "Save"} onPress={save} busy={busy} />
        </>
      )}
    </Screen>
  );
}
