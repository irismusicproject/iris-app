import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.white },
          headerTintColor: colors.iris,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.white },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Iris" }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in", headerBackVisible: false }} />
      </Stack>
    </SessionProvider>
  );
}
