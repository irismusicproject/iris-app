import { useRouter } from "expo-router";
import { useState } from "react";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@shared/auth/password";
import { Button, Field, Input, Muted, Problem, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// Set or change my password: at least 12 characters (src/shared/auth/password.ts),
// same messages as the website's /account/password.

export default function Password() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    const bad = validateNewPassword(password, confirm);
    if (bad) return setProblem(bad);
    setBusy(true);
    setProblem(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (!error) return router.back();
    if (error.code === "weak_password") setProblem("That password is too weak or has appeared in a data breach. Choose a different one.");
    else if (error.code === "same_password") setProblem("That's your current password. Choose a new one.");
    else if (error.code === "reauthentication_needed") setProblem("For security, log out and back in, then change your password.");
    else setProblem("We couldn't save your password. Please try again.");
  }

  return (
    <Screen>
      <Muted>Use at least {PASSWORD_MIN_LENGTH} characters. A short phrase works well, like &ldquo;cello tuesday 42&rdquo;.</Muted>
      <Field label="New password">
        <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      </Field>
      <Field label="Type it again">
        <Input value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={save} />
      </Field>
      {problem && <Problem>{problem}</Problem>}
      <Button label="Save password" onPress={save} busy={busy} />
    </Screen>
  );
}
