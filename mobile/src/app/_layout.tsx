import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { colors } from "@/lib/theme";
import { WeekProvider } from "@/lib/week-context";

export default function RootLayout() {
  return (
    <SessionProvider>
      <WeekProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.white },
            headerTintColor: colors.iris,
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.page },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in", headerBackVisible: false }} />
          <Stack.Screen name="document/[id]" options={{ title: "Document a program" }} />
          <Stack.Screen name="log" options={{ title: "Log relationship building" }} />
          <Stack.Screen name="reflection" options={{ title: "Monthly reflection" }} />
        </Stack>
      </WeekProvider>
    </SessionProvider>
  );
}
