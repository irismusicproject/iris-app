import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSession } from "@/lib/session";
import { isConfigured, supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Same messages as the website's sign-in (src/app/login/actions.ts).
const DEACTIVATED = "Your account has been deactivated. If you think that's a mistake, contact an Iris administrator.";

export default function SignIn() {
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  async function signIn() {
    if (!email.trim() || !password) return setMessage("Enter your email and password.");
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return; // the session change takes the person to Home
    if (error.code === "user_banned") setMessage(DEACTIVATED);
    else if (error.code === "over_request_rate_limit") setMessage("Too many attempts. Wait a few minutes and try again.");
    else if (error.message.toLowerCase().includes("network")) setMessage("No connection. Check your signal and try again.");
    else setMessage("That email and password don't match. Try again.");
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Iris Music Project</Text>
        {!isConfigured && (
          <Text style={styles.error}>This build isn't connected to Iris yet (mobile/.env.local is empty).</Text>
        )}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
          onSubmitEditing={signIn}
        />
        {message && <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text>}
        <Pressable style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]} onPress={signIn} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>
        <Text style={styles.hint}>Forgot your password? Reset it on the website, then come back here.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.irisSoft },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 24, gap: 8, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 22, fontWeight: "700", color: colors.iris, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.text },
  error: { color: colors.error, fontSize: 14, marginTop: 8 },
  button: { backgroundColor: colors.iris, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 13, marginTop: 12 },
});
