import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Share, Text, View } from "react-native";
import { Button, Card, LinkButton, Muted, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useWeek } from "@/lib/week-context";
import { WEBSITE, openWebsite } from "@/lib/website";

// More: who's signed in, the Iris staff directory (v0.26), and what still
// lives on the website (invoices, profile, password; admin work).

type Staff = { person_id: string; name: string; job_title: string | null; email: string; phone: string | null };

export default function More() {
  const router = useRouter();
  const { session } = useSession();
  const { me } = useWeek();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [feed, setFeed] = useState<string | null | undefined>(undefined);
  const [feedBusy, setFeedBusy] = useState(false);

  const loadFeed = () => {
    if (!me) return;
    supabase
      .from("calendar_feed")
      .select("token")
      .eq("person_id", me.id)
      .maybeSingle()
      .then(({ data }) => setFeed(data?.token ? `${WEBSITE}/calendar-feed/${data.token}.ics` : null));
  };

  useEffect(() => {
    supabase.rpc("staff_directory").then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, []);
  useEffect(loadFeed, [me]);

  async function createFeed() {
    setFeedBusy(true);
    const { error } = await supabase.from("calendar_feed").insert({ person_id: me!.id });
    setFeedBusy(false);
    if (error && error.code !== "23505") return Alert.alert("Calendar link", "We couldn't create your link. Please try again.");
    loadFeed();
  }

  return (
    <Screen>
      <Card title="Signed in">
        <Text style={{ fontSize: 16, color: colors.text }}>{me?.name}</Text>
        <Muted>{session?.user.email}</Muted>
        {process.env.EXPO_PUBLIC_IRIS_ENVIRONMENT === "staging" && <Muted>Test version: connected to staging (fake data only).</Muted>}
        <Button label="Log out" kind="secondary" onPress={() => supabase.auth.signOut()} />
      </Card>
      <Card title="Add Iris to your calendar">
        <Muted>
          A private link that adds your Iris programs (the ones you play in, plus your programs&apos; special events) to Google, Apple or Outlook Calendar. It updates on its
          own when the schedule changes.
        </Muted>
        {feed === null && <Button label="Create my calendar link" onPress={createFeed} busy={feedBusy} />}
        {feed && (
          <>
            <Button label="Share or copy my calendar link" kind="secondary" onPress={() => Share.share({ message: feed })} />
            <Muted>Google Calendar: on a computer, Other calendars → “+” → From URL, then paste the link. iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.</Muted>
            <Muted>Keep this link to yourself: anyone with it can see your Iris schedule.</Muted>
            <Muted>To make a new link (the old one stops working), use My week on the website.</Muted>
          </>
        )}
      </Card>
      <Card title="My account">
        <Button label="My profile: phone and instruments" kind="secondary" onPress={() => router.push("/profile")} />
        <Button label="Set or change my password" kind="secondary" onPress={() => router.push("/password")} />
        <Button label="My invoices (opens the website)" kind="secondary" onPress={() => openWebsite("/invoices")} />
      </Card>
      {staff.length > 0 && (
        <Card title="Iris staff">
          {staff.map((p) => (
            <View key={p.person_id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
              <Text style={{ fontSize: 15, color: colors.text }}>
                <Text style={{ fontWeight: "700" }}>{p.name}</Text>
                {p.job_title ? ` · ${p.job_title}` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                {p.phone && <LinkButton label={p.phone} onPress={() => Linking.openURL(`tel:${p.phone!.replace(/[^\d+]/g, "")}`)} />}
                <LinkButton label={p.email} onPress={() => Linking.openURL(`mailto:${p.email}`)} />
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
