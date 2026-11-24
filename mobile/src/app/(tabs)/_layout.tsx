import { Redirect, useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Pressable, Text, View, type ColorValue } from "react-native";
import { Button, Loading, styles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useWeek } from "@/lib/week-context";

// The three tabs (DOMAIN-MODEL v0.41): To do, Today, Calendar. My week and
// the account live one tap away. Building the schedule stays on the website.

export const unstable_settings = { initialRouteName: "todo" };

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

function AccountButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push("/more")} accessibilityRole="button" accessibilityLabel="Account and settings" hitSlop={12} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: colors.iris, fontSize: 15, fontWeight: "600" }}>Account</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { session, loading } = useSession();
  const { noAccess } = useWeek();
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
      <Tabs.Screen name="todo" options={{ title: "To do", tabBarIcon: icon("✓"), headerRight: () => <AccountButton /> }} />
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: icon("♪"), headerRight: () => <AccountButton /> }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: icon("▦"), headerRight: () => <AccountButton /> }} />
    </Tabs>
  );
}
