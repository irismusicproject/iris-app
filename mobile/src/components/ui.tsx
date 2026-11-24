import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { OfflineBanner } from "./offline";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type HostInstance,
  type ScrollViewInstance,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors } from "@/lib/theme";

// The phone app's building blocks. Big touch targets: musicians use this
// standing in a hallway right after a session.

// Android apps are edge to edge, so the screen doesn't shrink when the
// keyboard opens: it covers the bottom of the page. Screen adds room below
// the content while the keyboard is up, and Input scrolls the field being
// typed in to near the top, so it's always visible.
const ScrollToField = createContext<((field: TextInputInstance | null) => void) | null>(null);

export function Screen({
  children,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<HostInstance>(null);
  const focused = useRef<TextInputInstance | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  const reveal = () => {
    const field = focused.current;
    if (!field || !content.current) return;
    field.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }), () => {});
  };

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboard(e.endCoordinates.height);
      setTimeout(reveal, 50);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <ScrollToField.Provider
      value={(field) => {
        focused.current = field;
        if (Keyboard.isVisible()) setTimeout(reveal, 50);
      }}
    >
      <ScrollView
        ref={scroll}
        style={[styles.screen, style]}
        contentContainerStyle={[styles.content, contentStyle, keyboard ? { paddingBottom: keyboard + 48 } : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.iris} colors={[colors.iris]} /> : undefined}
      >
        <View ref={content} style={{ gap: 14 }} collapsable={false}>
          <OfflineBanner />
          {children}
        </View>
      </ScrollView>
    </ScrollToField.Provider>
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
  const scrollTo = useContext(ScrollToField);
  const ref = useRef<TextInputInstance>(null);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.muted}
      {...props}
      onFocus={(e) => {
        scrollTo?.(ref.current);
        props.onFocus?.(e);
      }}
      style={[styles.input, props.multiline && styles.multiline, props.style]}
    />
  );
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
  stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 26, color: colors.iris, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});

/** "13:30" → "1:30 PM" */
export function timeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Tap to pick a time with the phone's own clock dial; value is "HH:MM" or "". */
export function TimeField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const initial = value ? new Date(2000, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3, 5))) : new Date(2000, 0, 1, now.getHours(), Math.round(now.getMinutes() / 5) * 5);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${placeholder}: ${timeLabel(value)}. Change` : placeholder}
        style={({ pressed }) => [styles.input, { justifyContent: "center" }, pressed && styles.pressed]}
      >
        <Text style={{ fontSize: 16, color: value ? colors.text : colors.muted }}>{value ? timeLabel(value) : placeholder}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={initial}
          mode="time"
          minuteInterval={5}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, date) => {
            if (Platform.OS !== "ios") setOpen(false);
            if (event.type === "set" && date) onChange(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
          }}
        />
      )}
      {open && Platform.OS === "ios" && <LinkButton label="Done" onPress={() => setOpen(false)} />}
    </View>
  );
}

/** − 12 + : a number with big buttons either side (attendance, minutes). */
export function Stepper({ value, onChange, step = 1, min = 0 }: { value: string; onChange: (v: string) => void; step?: number; min?: number }) {
  const n = Number(value) || 0;
  const btn = (label: string, next: number, a11y: string) => (
    <Pressable
      onPress={() => onChange(String(Math.max(min, next)))}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {btn("−", n - step, `${step} fewer`)}
      <Input value={value} onChangeText={onChange} keyboardType="number-pad" inputMode="numeric" style={{ flex: 1, textAlign: "center", fontSize: 20 }} placeholder="0" />
      {btn("+", n + step, `${step} more`)}
    </View>
  );
}
