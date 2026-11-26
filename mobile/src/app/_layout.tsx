import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { OutboxProvider } from "@/lib/offline/outbox";
import { SessionProvider } from "@/lib/session";
import { colors } from "@/lib/theme";
import { WeekProvider } from "@/lib/week-context";

export default function RootLayout() {
  return (
    <SessionProvider>
      <WeekProvider>
      <OutboxProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.white },
            headerTintColor: colors.iris,
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.page },
          }}
        >
          {/* The title is what iOS shows on the next screen's back button; without it the button reads "(tabs)". */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Back" }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in", headerBackVisible: false }} />
          <Stack.Screen name="document/[id]" options={{ title: "Document a program" }} />
          <Stack.Screen name="log" options={{ title: "Log relationship building" }} />
          <Stack.Screen name="reflection" options={{ title: "Monthly reflection" }} />
          <Stack.Screen name="date/[id]" options={{ title: "Date" }} />
          <Stack.Screen name="review" options={{ title: "Review my dates" }} />
          <Stack.Screen name="profile" options={{ title: "My profile" }} />
          <Stack.Screen name="password" options={{ title: "Password" }} />
          <Stack.Screen name="week" options={{ title: "My week" }} />
          <Stack.Screen name="more" options={{ title: "Account" }} />
          <Stack.Screen name="month-review" options={{ title: "Review the month" }} />
          <Stack.Screen name="month-send" options={{ title: "Calendar to partner" }} />
        </Stack>
      </OutboxProvider>
      </WeekProvider>
    </SessionProvider>
  );
}
