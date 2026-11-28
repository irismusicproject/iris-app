import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { formatMonth } from "@shared/domain/time";
import { Button, Card, LinkButton, Loading, Muted, Notice, Problem, Screen } from "@/components/ui";
import { monthAction, STAGE_LABEL, type Stage } from "@/lib/month";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { openWebsite } from "@/lib/website";

// "Send calendar to partner" (the 10th) and "Mark final and send" (by the
// 15th), for the Lead Musician (DOMAIN-MODEL v0.41). One button: the website
// makes the PDF from the published dates and emails it from Iris to the
// building's calendar contacts, copying the Iris Supervisor and the Lead Musician.

export default function MonthSend() {
  const { residencyId, siteId, month, action } = useLocalSearchParams<{ residencyId: string; siteId: string; month: string; action: "send" | "finalize" }>();
  const [stage, setStage] = useState<Stage | null | undefined>(undefined);
  const [building, setBuilding] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; emailed?: boolean } | null>(null);

  const load = useCallback(async () => {
    const [{ data: sm }, { data: site }] = await Promise.all([
      supabase.from("schedule_month").select("stage").eq("residency_id", residencyId).eq("site_id", siteId).eq("month", `${month}-01`).maybeSingle(),
      supabase.from("site").select("display_name").eq("id", siteId).maybeSingle(),
    ]);
    setStage((sm?.stage as Stage | undefined) ?? null);
    setBuilding(site?.display_name ?? "");
  }, [residencyId, siteId, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (stage === undefined) return <Loading />;
  const label = formatMonth(month);
  const final = action === "finalize";
  const done = final ? stage === "final" : stage !== null && stage !== "team_editing" && stage !== "team_confirmed";

  async function go(what: "send" | "finalize" | "resend") {
    setBusy(true);
    setResult(await monthAction(what, residencyId, siteId, month));
    setBusy(false);
    load();
  }

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{final ? `Mark ${label} final` : `Send ${label} to the partner`}</Text>
      <Muted>{building}{stage ? ` · now: ${STAGE_LABEL[stage]}` : ""}</Muted>
      <Card>
        <Muted>
          {final
            ? "Makes the final calendar (a new version if anything changed after the draft), emails it to the partner and locks the month. After this, changes go through the Iris Supervisor."
            : "Publishes the month's dates, makes the draft calendar PDF and emails it from Iris. If the Iris Supervisor hasn't confirmed yet, sending confirms it."}
        </Muted>
        <Muted>Goes to the building&apos;s partner contacts marked &ldquo;receives calendar&rdquo;, with copies to the Iris Supervisor and you.</Muted>
        <LinkButton label="See the PDF first" onPress={() => openWebsite(`/residencies/${residencyId}/month/${month}/calendar?site=${siteId}&view=1`)} />
      </Card>
      {result && (result.ok ? <Notice>{result.message}</Notice> : <Problem>{result.message}</Problem>)}
      {!done ? (
        <Button
          label={final ? "Mark final and send" : "Make PDF and email it"}
          busy={busy}
          onPress={() =>
            Alert.alert(final ? "Mark final" : "Send to the partner", final ? `Send the final ${label} calendar and lock the month?` : `Email the ${label} draft calendar to the partner now?`, [
              { text: "Cancel", style: "cancel" },
              { text: final ? "Mark final and send" : "Send", onPress: () => go(final ? "finalize" : "send") },
            ])
          }
        />
      ) : (
        <Button label="Email it again" kind="secondary" busy={busy} onPress={() => go("resend")} />
      )}
    </Screen>
  );
}
