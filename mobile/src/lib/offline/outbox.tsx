import NetInfo from "@react-native-community/netinfo";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { supabase } from "../supabase";
import { friendly, useWeek } from "../week-context";
import { cacheGet, cacheSet, hasScreenLock, newId, outboxList, outboxPut, outboxRemove, type OutboxItem, type OutboxKind } from "./store";

// The outbox (OFFLINE-SPEC 4.2–4.3): work saved on this phone until it can be
// sent. Each item is sent with a call that's safe to repeat (the phone chose
// its id), so a lost answer never makes a duplicate. What the person sees:
// "Saved on this phone", "Needs attention", "All caught up".

export const MAX_DAYS_DEFAULT = 14; // O8, Setting offline_signin_max_days

type AddResult = "sent" | "saved" | "needs_attention" | "no_storage";

type State = {
  online: boolean;
  /** Phone has a screen lock, so it may keep work offline (O12). */
  canStore: boolean;
  /** Too long since the phone last reached Iris with a valid sign-in (O8). */
  signInNeeded: boolean;
  maxDays: number;
  items: OutboxItem[];
  sending: boolean;
  caughtUp: string | null;
  lastSynced: string | null;
  add: (kind: OutboxKind, payload: Record<string, unknown>, summary: string) => Promise<{ result: AddResult; problem?: string }>;
  flush: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  samePerson: (id: string) => Promise<void>;
  differentPerson: (id: string, disambiguator: string) => Promise<void>;
};

export const OutboxContext = createContext<State | null>(null);

export const isNetworkError = (e: { message?: string } | null | undefined) => /network request failed|failed to fetch|network|fetch|timed? ?out|aborted/i.test(e?.message ?? "");

/** The phone reached Iris and the sign-in was accepted (O8). */
export async function markConfirmed() {
  await cacheSet("confirmed_at", new Date().toISOString());
}

type Outcome = { ok: true } | { ok: false; network: true } | { ok: false; network: false; problem: string; conflict?: OutboxItem["conflict"] };

async function send(item: OutboxItem): Promise<Outcome> {
  if (item.kind === "activity") {
    const { error } = await supabase.rpc("log_relationship_activity", item.payload as never);
    if (!error) return { ok: true };
    if (isNetworkError(error)) return { ok: false, network: true };
    if (error.message === "resident_exists") {
      const added = ((item.payload.p_new_residents ?? []) as { id: string; name: string }[]).find((r) => r.name.toLowerCase() === String(error.details).toLowerCase());
      return {
        ok: false,
        network: false,
        problem: `${error.details} was added to the list by someone else while you were offline. Is it the same person?`,
        conflict: added ? { name: added.name, newId: added.id, existingId: String(error.hint) } : null,
      };
    }
    return { ok: false, network: false, problem: friendly(error) };
  }
  // A program report: a new one only (changing one already sent needs a connection, O11).
  const { error } = await supabase.from("session_report").insert(item.payload as never);
  if (!error) return { ok: true };
  if (isNetworkError(error)) return { ok: false, network: true };
  if (error.code === "23505") {
    const { data } = await supabase.from("session_report").select("id").eq("id", String(item.payload.id)).maybeSingle();
    if (data) return { ok: true }; // the first send arrived; its answer was lost
    return { ok: false, network: false, problem: "This program was already documented, maybe on another phone or the website. Discard this copy, then open the program with a connection to change it." };
  }
  return { ok: false, network: false, problem: friendly(error) };
}

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { me, reload } = useWeek();
  const personId = me?.id ?? null;
  const [online, setOnline] = useState(true);
  const [canStore, setCanStore] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [sending, setSending] = useState(false);
  const [caughtUp, setCaughtUp] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [maxDays, setMaxDays] = useState(MAX_DAYS_DEFAULT);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!personId) return setItems([]);
    setItems(await outboxList(personId));
    const c = await cacheGet<string>("confirmed_at");
    setConfirmedAt(c?.value ?? null);
    const m = await cacheGet<number>("max_days");
    if (m) setMaxDays(m.value);
  }, [personId]);

  const flush = useCallback(async () => {
    if (!personId || busy.current) return;
    busy.current = true;
    setSending(true);
    let sent = 0;
    try {
      for (const item of await outboxList(personId)) {
        if (item.state !== "saved") continue;
        const out = await send(item);
        if (out.ok) {
          await outboxRemove(item.id);
          sent++;
        } else if (out.network) {
          break;
        } else {
          await outboxPut({ ...item, state: "needs_attention", problem: out.problem, conflict: out.conflict ?? null });
        }
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
    if (sent) {
      setCaughtUp(`All caught up. ${sent} item${sent === 1 ? "" : "s"} sent.`);
      const now = new Date().toISOString();
      setLastSynced(now);
      await markConfirmed();
      reload();
    }
    await refresh();
  }, [personId, refresh, reload]);

  // Reaching Iris with an accepted sign-in restarts the 14 days (O8): any
  // signed-in read that succeeds counts, not only sending something. Without
  // this, a phone just signed in (or one that only reads for two weeks) was
  // told offline that it hadn't reached Iris in more than 14 days.
  const checkIn = useCallback(() => {
    if (!personId) return;
    supabase
      .from("setting")
      .select("value")
      .eq("key", "offline_signin_max_days")
      .maybeSingle()
      .then(({ data, error }) => {
        // Offline, refused, or no row back (a deactivated person reads no
        // settings): nothing to record. The row exists for anyone active.
        if (error || !data) return;
        const now = new Date().toISOString();
        markConfirmed();
        setConfirmedAt(now);
        const n = Number(data?.value);
        if (Number.isInteger(n) && n > 0) {
          setMaxDays(n);
          cacheSet("max_days", n);
        }
      });
  }, [personId]);

  // When signed in: what's waiting, the sign-in limit (O8), screen lock (O12).
  useEffect(() => {
    if (!personId) return;
    hasScreenLock().then(setCanStore);
    refresh().then(flush);
    checkIn();
  }, [personId, refresh, flush, checkIn]);

  // Send when the connection comes back, and when the app is opened again.
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => {
      const up = Boolean(s.isConnected) && s.isInternetReachable !== false;
      setOnline((was) => {
        if (up && !was) {
          flush();
          checkIn();
        }
        return up;
      });
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        hasScreenLock().then(setCanStore);
        flush();
        checkIn();
      }
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, [flush, checkIn]);

  const signInNeeded = !online && (!confirmedAt || Date.now() - new Date(confirmedAt).getTime() > maxDays * 86_400_000);

  const add = useCallback<State["add"]>(
    async (kind, payload, summary) => {
      const item: OutboxItem = { id: String(payload.p_id ?? payload.id ?? newId()), personId: personId!, kind, payload, summary, state: "saved", problem: null, conflict: null, createdAt: new Date().toISOString() };
      const storable = await hasScreenLock();
      setCanStore(storable);
      if (!storable) {
        // No screen lock: online only, nothing kept on the phone (O12).
        const out = await send(item);
        if (out.ok) {
          await markConfirmed();
          reload();
          return { result: "sent" };
        }
        return { result: "no_storage", problem: out.network ? "No connection. Turn on a screen lock (PIN, pattern or fingerprint) in your phone's settings to save work offline." : out.problem };
      }
      if (signInNeeded) return { result: "no_storage", problem: `It's been more than ${maxDays} days since this phone last reached Iris. Connect and open the app to keep saving offline. Your unsent work is safe.` };
      await outboxPut(item);
      const out = await send(item);
      if (out.ok) {
        await outboxRemove(item.id);
        await markConfirmed();
        setLastSynced(new Date().toISOString());
        await refresh();
        reload();
        return { result: "sent" };
      }
      if (!out.network) await outboxPut({ ...item, state: "needs_attention", problem: out.problem, conflict: out.conflict ?? null });
      await refresh();
      return out.network ? { result: "saved" } : { result: "needs_attention", problem: out.problem };
    },
    [personId, refresh, reload, signInNeeded, maxDays],
  );

  const update = useCallback(
    async (id: string, change: (i: OutboxItem) => OutboxItem) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      await outboxPut(change(item));
      await refresh();
      await flush();
    },
    [items, refresh, flush],
  );

  const value: State = {
    online,
    canStore,
    signInNeeded,
    maxDays,
    items,
    sending,
    caughtUp,
    lastSynced,
    add,
    flush,
    discard: async (id) => {
      await outboxRemove(id);
      await refresh();
    },
    retry: (id) => update(id, (i) => ({ ...i, state: "saved", problem: null, conflict: null })),
    // The name someone else added is this resident: use theirs.
    samePerson: (id) =>
      update(id, (i) => {
        const c = i.conflict!;
        const added = (i.payload.p_new_residents ?? []) as { id: string; room: string | null }[];
        const room = added.find((r) => r.id === c.newId)?.room ?? null;
        return {
          ...i,
          state: "saved",
          problem: null,
          conflict: null,
          payload: {
            ...i.payload,
            p_new_residents: added.filter((r) => r.id !== c.newId),
            p_residents: [...((i.payload.p_residents ?? []) as unknown[]), { id: c.existingId, room }],
          },
        };
      }),
    // A different person with the same name: add a word to tell them apart.
    differentPerson: (id, disambiguator) =>
      update(id, (i) => ({
        ...i,
        state: "saved",
        problem: null,
        conflict: null,
        payload: {
          ...i.payload,
          p_new_residents: ((i.payload.p_new_residents ?? []) as { id: string }[]).map((r) => (r.id === i.conflict!.newId ? { ...r, disambiguator } : r)),
        },
      })),
  };

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): State {
  const v = useContext(OutboxContext);
  if (!v) throw new Error("useOutbox outside OutboxProvider");
  return v;
}
