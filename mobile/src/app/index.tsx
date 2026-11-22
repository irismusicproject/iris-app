import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Home, for now: proves the phone reaches the database through its
// permission rules by reading the signed-in person's own name.

export default function Home() {
  const { session, loading } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("person")
      .select("name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setProblem("Couldn't load your details. Check your connection and try again.");
        else if (!data) setProblem("Signed in, but no Iris profile was found for this account.");
        else setName(data.name);
      });
  }, [session]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.iris} /></View>;
  if (!session) return <Redirect href="/sign-in" />;

  const first = name?.trim().split(/\s+/)[0];
  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>{first ? `Hello, ${first}.` : problem ? "Hello." : "Hello…"}</Text>
      {problem && <Text style={styles.problem}>{problem}</Text>}
      <Text style={styles.muted}>Signed in as {session.user.email}</Text>
      <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={() => supabase.auth.signOut()} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  screen: { flex: 1, padding: 24, gap: 12 },
  greeting: { fontSize: 28, fontWeight: "700", color: colors.iris, marginTop: 24 },
  problem: { color: colors.error, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 14 },
  button: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18, marginTop: 24 },
  pressed: { opacity: 0.6 },
  buttonText: { color: colors.iris, fontSize: 15, fontWeight: "600" },
});
