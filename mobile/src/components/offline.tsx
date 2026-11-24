import { useContext, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { OutboxContext } from "@/lib/offline/outbox";
import { colors } from "@/lib/theme";

// What the person sees about offline work (OFFLINE-SPEC 6): the banner, each
// unsent item's state in plain words, and Needs attention with a fix.

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function OfflineBanner() {
  const o = useContext(OutboxContext);
  if (!o) return null;
  const saved = o.items.filter((i) => i.state === "saved").length;
  const attention = o.items.filter((i) => i.state === "needs_attention").length;
  const lines: { text: string; tone: "info" | "warn" | "ok" }[] = [];
  if (!o.online)
    lines.push(
      o.signInNeeded
        ? { text: `You're offline, and it's been more than ${o.maxDays} days since this phone last reached Iris. Connect to keep saving work. Your unsent work is safe.`, tone: "warn" }
        : o.canStore
          ? { text: "You're offline. Your work is saved on this phone and will send when you're back online.", tone: "info" }
          : { text: "You're offline. To save work offline, turn on a screen lock (PIN, pattern or fingerprint) in your phone's settings.", tone: "warn" },
    );
  if (saved) lines.push({ text: o.sending ? `Sending ${saved} item${saved === 1 ? "" : "s"}…` : `${saved} item${saved === 1 ? "" : "s"} saved on this phone, not sent yet.`, tone: "info" });
  if (attention) lines.push({ text: `${attention} item${attention === 1 ? " needs" : "s need"} attention. See My week.`, tone: "warn" });
  if (!saved && !attention && o.caughtUp && o.online) lines.push({ text: o.caughtUp, tone: "ok" });
  if (!lines.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {lines.map((l) => (
        <Text
          key={l.text}
          style={{
            padding: 10,
            borderRadius: 10,
            fontSize: 14,
            color: l.tone === "warn" ? colors.orange : colors.iris,
            backgroundColor: l.tone === "warn" ? "#FDF3E7" : colors.irisSoft,
          }}
        >
          {l.text}
        </Text>
      ))}
    </View>
  );
}

/** Unsent work on My week: Saved on this phone / Needs attention, with fixes. */
export function OutboxList() {
  const o = useContext(OutboxContext);
  const [names, setNames] = useState<Record<string, string>>({});
  if (!o || !o.items.length) return null;
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>Not sent yet</Text>
      <Text style={{ color: colors.muted }}>
        These are on this phone only. Hours count them once they&apos;re sent.{o.lastSynced ? ` Last synced ${when(o.lastSynced)}.` : ""}
      </Text>
      {o.items.map((i) => (
        <View key={i.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6 }}>
          <Text style={{ fontWeight: "700", color: i.state === "needs_attention" ? colors.orange : colors.iris }}>
            {i.state === "needs_attention" ? "Needs attention" : o.sending ? "Sending" : "Saved on this phone"}
          </Text>
          <Text style={{ color: colors.text }}>
            {i.kind === "report" ? "Program report: " : ""}
            {i.summary}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Saved {when(i.createdAt)}</Text>
          {i.problem && <Text style={{ color: colors.text }}>{i.problem}</Text>}
          {i.conflict && (
            <View style={{ gap: 8 }}>
              <Link label={`Yes, the same ${i.conflict.name}`} onPress={() => o.samePerson(i.id)} />
              <Text style={{ color: colors.muted }}>No, a different person: add a word to tell them apart (e.g. &ldquo;2nd floor&rdquo;).</Text>
              <TextInput
                value={names[i.id] ?? ""}
                onChangeText={(t) => setNames({ ...names, [i.id]: t })}
                placeholder="e.g. 2nd floor"
                maxLength={80}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 16, color: colors.text, backgroundColor: colors.white }}
              />
              <Link label="Different person: send" disabled={!(names[i.id] ?? "").trim()} onPress={() => o.differentPerson(i.id, (names[i.id] ?? "").trim())} />
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 18, flexWrap: "wrap" }}>
            {i.state === "needs_attention" && !i.conflict && <Link label="Try again" onPress={() => o.retry(i.id)} />}
            {i.state === "saved" && o.online && <Link label="Send now" onPress={() => o.flush()} />}
            <Link
              label="Discard"
              danger
              onPress={() =>
                Alert.alert("Discard this?", "It hasn't been sent, so it will be gone for good.", [
                  { text: "Keep it", style: "cancel" },
                  { text: "Discard", style: "destructive", onPress: () => o.discard(i.id) },
                ])
              }
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Link({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Text
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      style={{ fontSize: 15, fontWeight: "700", paddingVertical: 4, color: disabled ? colors.muted : danger ? "#B3261E" : colors.iris }}
    >
      {label}
    </Text>
  );
}

export const lastUpdated = (iso: string) => `Saved copy. Last updated ${when(iso)}.`;
