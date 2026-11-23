import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isValidEmail, normalizeCode } from "@shared/auth/password";
import { useSession } from "@/lib/session";
import { isConfigured, supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Sign-in (decided by Ryan, Nov 2026): email and password is the normal way
// in; an emailed one-time code is the fallback. Same rules and messages as
// the website (src/app/login/actions.ts, src/shared/auth/password.ts).
// Setting or resetting a password stays on the website.

const DEACTIVATED = "Your account has been deactivated. If you think that's a mistake, contact an Iris administrator.";
const offline = (m: string) => /network|fetch/i.test(m);

export default function SignIn() {
  const { session } = useSession();
  const [mode, setMode] = useState<"password" | "code" | "code-sent">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  async function signIn() {
    if (!isValidEmail(email.trim()) || !password) return setMessage("Enter your email and password.");
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return; // the session change takes the person to Upcoming
    if (error.code === "user_banned") setMessage(DEACTIVATED);
    else if (error.code === "over_request_rate_limit") setMessage("Too many attempts. Wait a few minutes and try again.");
    else if (offline(error.message)) setMessage("No connection. Check your signal and try again.");
    else setMessage("That email and password don't match. Try again, or use “Email me a code instead”.");
  }

  async function sendCode() {
    if (!isValidEmail(email.trim())) return setMessage("Enter a valid email address.");
    setBusy(true);
    setMessage(null);
    // Only people already added can sign in; no public sign-up.
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    // Unknown emails get the same reply, so the form doesn't reveal who has an account.
    if (error?.code === "user_banned") return setMessage(DEACTIVATED);
    if (error && error.code !== "otp_disabled" && error.code !== "user_not_found") {
      if (error.code === "over_email_send_rate_limit" || error.status === 429) return setMessage("A code was sent recently. Wait a minute before asking for another.");
      if (offline(error.message)) return setMessage("No connection. Check your signal and try again.");
      return setMessage("We couldn't send a code. Please try again.");
    }
    setMode("code-sent");
  }

  async function verifyCode() {
    const token = normalizeCode(code);
    if (!token) return setMessage("Enter the code from the email.");
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setBusy(false);
    if (!error) return;
    if (error.code === "user_banned") setMessage(DEACTIVATED);
    else if (offline(error.message)) setMessage("No connection. Check your signal and try again.");
    else setMessage("That code is wrong or has expired. Check the latest email, or ask for a new code.");
  }

  const primary = mode === "password" ? signIn : mode === "code" ? sendCode : verifyCode;
  const primaryLabel = mode === "password" ? "Log in" : mode === "code" ? "Email me a code" : "Log in";

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Iris Music Project</Text>
          {process.env.EXPO_PUBLIC_IRIS_ENVIRONMENT === "staging" && <Text style={styles.hint}>Test version: staging, fake data only.</Text>}
          {!isConfigured && <Text style={styles.error}>This build isn&apos;t connected to Iris yet (mobile/.env.local is empty).</Text>}

          {mode !== "code-sent" ? (
            <>
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
                onSubmitEditing={mode === "code" ? sendCode : undefined}
              />
            </>
          ) : (
            <Text style={styles.sent}>
              If <Text style={{ fontWeight: "700" }}>{email.trim()}</Text> has an Iris account, we just emailed it a sign-in code.
            </Text>
          )}

          {mode === "password" && (
            <>
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
            </>
          )}
          {mode === "code-sent" && (
            <>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={[styles.input, styles.code]}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={12}
                autoFocus
                editable={!busy}
                onSubmitEditing={verifyCode}
              />
            </>
          )}

          {message && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
          <Pressable style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]} onPress={primary} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{primaryLabel}</Text>}
          </Pressable>

          {mode === "password" && (
            <Pressable onPress={() => { setMode("code"); setMessage(null); }} accessibilityRole="button" style={styles.linkWrap}>
              <Text style={styles.link}>Email me a code instead</Text>
            </Pressable>
          )}
          {mode === "code-sent" && (
            <Pressable onPress={sendCode} disabled={busy} accessibilityRole="button" style={styles.linkWrap}>
              <Text style={styles.link}>Send a new code</Text>
            </Pressable>
          )}
          {mode !== "password" && (
            <Pressable onPress={() => { setMode("password"); setCode(""); setMessage(null); }} accessibilityRole="button" style={styles.linkWrap}>
              <Text style={styles.link}>Use my password instead</Text>
            </Pressable>
          )}
          <Text style={styles.hint}>Forgot your password? Reset it on the website, then come back here.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.irisSoft },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 24, gap: 8, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 22, fontWeight: "700", color: colors.iris, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.text },
  code: { letterSpacing: 6, fontSize: 20 },
  sent: { backgroundColor: colors.irisSoft, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text },
  error: { color: colors.error, fontSize: 14, marginTop: 8 },
  button: { backgroundColor: colors.iris, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 16, minHeight: 50, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  linkWrap: { paddingVertical: 8 },
  link: { color: colors.iris, fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  hint: { color: colors.muted, fontSize: 13, marginTop: 8 },
});
