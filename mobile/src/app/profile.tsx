import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { validateSelfEdit } from "@shared/domain/person";
import { Button, Field, Input, Loading, Problem, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useWeek } from "@/lib/week-context";

// My profile: a person may change only their own phone and instruments
// (DOMAIN-MODEL section 7). Same check as the website (validateSelfEdit).

export default function Profile() {
  const router = useRouter();
  const { me } = useWeek();
  const [phone, setPhone] = useState("");
  const [instruments, setInstruments] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    supabase
      .from("person")
      .select("phone, instruments")
      .eq("id", me.id)
      .maybeSingle()
      .then(({ data }) => {
        setPhone(data?.phone ?? "");
        setInstruments((data?.instruments ?? []).join(", "));
        setLoaded(true);
      });
  }, [me]);

  if (!me || !loaded) return <Loading />;

  async function save() {
    const form = new FormData();
    form.append("phone", phone);
    form.append("instruments", instruments);
    const parsed = validateSelfEdit(form);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    setBusy(true);
    setProblem(null);
    const { error } = await supabase.from("person").update(parsed.value).eq("id", me!.id);
    setBusy(false);
    if (error) return setProblem("We couldn't save your changes. Please try again.");
    router.back();
  }

  return (
    <Screen>
      <Field label="Phone" hint="Shown to the people in your programs." error={errors.phone}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
      </Field>
      <Field label="Instruments" hint="Separate with commas, e.g. violin, viola" error={errors.instruments}>
        <Input value={instruments} onChangeText={setInstruments} autoCapitalize="none" />
      </Field>
      {problem && <Problem>{problem}</Problem>}
      <Button label="Save" onPress={save} busy={busy} />
    </Screen>
  );
}
