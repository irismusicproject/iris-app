import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Text, View, type ColorValue } from "react-native";
import { Button, Loading, styles } from "@/components/ui";
import { useOutbox } from "@/lib/offline/outbox";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useWeek } from "@/lib/week-context";

// The three tabs a musician sees once signed in. Admin work stays on the website.

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { session, loading } = useSession();
  const { noAccess, week } = useWeek();
  const outbox = useOutbox();
  const toDocument = week ? week.ledPast.filter((s) => !s.session_report && !outbox.items.some((i) => i.kind === "report" && i.payload.session_id === s.id)).length : 0;
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  if (noAccess)
    return (
      <View style={[styles.center, { padding: 24, gap: 16 }]}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.iris }}>Your account isn&apos;t active</Text>
        <Text style={styles.muted}>
          You&apos;re signed in as {session.user.email}, but there&apos;s no active Iris record for this email. Ask an Iris administrator to add or reactivate you.
        </Text>
        <Button label="Log out" kind="secondary" onPress={() => supabase.auth.signOut()} />
      </View>
    );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.iris,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        headerTintColor: colors.iris,
        headerTitleStyle: { fontWeight: "700" },
        sceneStyle: { backgroundColor: colors.page },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Upcoming", tabBarIcon: icon("♪") }} />
      <Tabs.Screen name="week" options={{ title: "My week", tabBarIcon: icon("✎"), tabBarBadge: toDocument || undefined, tabBarBadgeStyle: { backgroundColor: colors.orange } }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("☰") }} />
    </Tabs>
  );
}
