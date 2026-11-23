import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Card, LinkButton, Muted, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useWeek } from "@/lib/week-context";

// More: who's signed in, the Iris staff directory (v0.26), and what still
// lives on the website (invoices, profile, password; admin work).

type Staff = { person_id: string; name: string; job_title: string | null; email: string; phone: string | null };

export default function More() {
  const { session } = useSession();
  const { me } = useWeek();
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    supabase.rpc("staff_directory").then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, []);

  return (
    <Screen>
      <Card title="Signed in">
        <Text style={{ fontSize: 16, color: colors.text }}>{me?.name}</Text>
        <Muted>{session?.user.email}</Muted>
        {process.env.EXPO_PUBLIC_IRIS_ENVIRONMENT === "staging" && <Muted>Test version: connected to staging (fake data only).</Muted>}
        <Button label="Log out" kind="secondary" onPress={() => supabase.auth.signOut()} />
      </Card>
      <Card title="On the website">
        <Muted>Your invoices, your profile (phone and instruments), and changing your password are on the Iris website for now.</Muted>
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
