import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { formatMonth } from "@shared/domain/time";
import { Button, Field, Input, Loading, Muted, Problem, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { friendly, useWeek } from "@/lib/week-context";

// The month's reflection for one program (MonthlyReflection, D13). Same two
// questions as the website. The month is the one the week on screen ends in.

export default function Reflection() {
  const { residencyId } = useLocalSearchParams<{ residencyId: string }>();
  const router = useRouter();
  const { me, week, reload } = useWeek();
  const existing = week?.reflections.get(residencyId);
  const [highlights, setHighlights] = useState(existing?.highlights ?? "");
  const [challenges, setChallenges] = useState(existing?.challenges ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!week || !me) return <Loading />;
  const residency = week.residencies.find((p) => p.id === residencyId);

  async function save() {
    setBusy(true);
    setProblem(null);
    const { error } = await supabase.from("monthly_reflection").upsert(
      { person_id: me!.id, residency_id: residencyId, month: `${week!.month}-01`, highlights: highlights.slice(0, 4000), challenges: challenges.slice(0, 4000) },
      { onConflict: "person_id,residency_id,month" },
    );
    setBusy(false);
    if (error) return setProblem(friendly(error));
    await reload();
    router.back();
  }

  return (
    <Screen>
      <Muted>
        {formatMonth(week.month)}
        {residency ? ` · ${residency.name}` : ""}. Fill in any time this month; it&apos;s due with the last week&apos;s documentation.
      </Muted>
      <Field label="Highlights and successes" hint="What am I most proud of this month?">
        <Input value={highlights} onChangeText={setHighlights} multiline maxLength={4000} />
      </Field>
      <Field label="Challenges and suggestions" hint="What were my biggest barriers to success this month?">
        <Input value={challenges} onChangeText={setChallenges} multiline maxLength={4000} />
      </Field>
      {problem && <Problem>{problem}</Problem>}
      <Button label="Save reflection" onPress={save} busy={busy} />
    </Screen>
  );
}
