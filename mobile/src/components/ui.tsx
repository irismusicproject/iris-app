import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/lib/theme";

// The phone app's building blocks. Big touch targets: musicians use this
// standing in a hallway right after a session.

export function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.iris} colors={[colors.iris]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.iris} size="large" />
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function Muted({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) {
  return (
    <Text style={styles.muted} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.problem} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.notice} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Button({ label, onPress, busy, disabled, kind = "primary" }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; kind?: "primary" | "secondary" | "danger" }) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.button, kind !== "primary" && styles.buttonSecondary, kind === "danger" && styles.buttonDanger, (pressed || off) && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? colors.white : colors.iris} />
      ) : (
        <Text style={[styles.buttonText, kind !== "primary" && styles.buttonTextSecondary, kind === "danger" && styles.buttonTextDanger]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />;
}

/** A row of pill buttons standing in for a dropdown or checkboxes. */
export function Choices<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: T[] | T;
  onToggle: (value: T) => void;
}) {
  const isOn = (v: T) => (Array.isArray(selected) ? selected.includes(v) : selected === v);
  return (
    <View style={styles.choices}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onToggle(o.value)}
          accessibilityRole={Array.isArray(selected) ? "checkbox" : "radio"}
          accessibilityState={Array.isArray(selected) ? { checked: isOn(o.value) } : { selected: isOn(o.value) }}
          style={({ pressed }) => [styles.chip, isOn(o.value) && styles.chipOn, pressed && styles.pressed]}
        >
          <Text style={[styles.chipText, isOn(o.value) && styles.chipTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Tag({ label, tone = "soft" }: { label: string; tone?: "soft" | "todo" }) {
  return (
    <View style={[styles.tag, tone === "todo" && styles.tagTodo]}>
      <Text style={[styles.tagText, tone === "todo" && styles.tagTextTodo]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.page },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  problem: { color: colors.error, fontSize: 15, lineHeight: 21 },
  notice: { color: colors.iris, fontSize: 15, fontWeight: "600" },
  button: { backgroundColor: colors.iris, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", minHeight: 50, justifyContent: "center" },
  buttonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { borderColor: colors.error },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  buttonTextSecondary: { color: colors.iris },
  buttonTextDanger: { color: colors.error },
  pressed: { opacity: 0.6 },
  link: { color: colors.iris, fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: "600", color: colors.text },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  fieldError: { fontSize: 13, color: colors.error },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.white },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.iris, borderColor: colors.iris },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { color: colors.white, fontWeight: "600" },
  tag: { alignSelf: "flex-start", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: colors.irisSoft },
  tagTodo: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.orange },
  tagText: { fontSize: 12, color: colors.iris, fontWeight: "600" },
  tagTextTodo: { color: colors.orange },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
