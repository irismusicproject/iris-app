import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { offlineNow } from "./net";
import { cacheGet, cacheSet, wipe } from "./offline/store";
import { useSession } from "./session";
import { supabase } from "./supabase";
import { defaultWeek, loadWeek, type Week } from "./week";

// The signed-in person and the week on screen, shared by the My week tab and
// the screens it opens (document a session, log an activity, reflection), so
// a save on one shows up on the others. The last copy is kept (encrypted) on
// the phone so the screens open without signal (OFFLINE-SPEC 3.2): `cachedAt`
// says when it was loaded. Resident room numbers are left out of that copy (O7).

const isNetwork = (e: { message?: string } | null | undefined) => /network|fetch/i.test(e?.message ?? "");

/** The week without room numbers: the phone keeps names only (O7). */
function forPhone(w: Week): Week {
  return {
    ...w,
    residents: w.residents.map((r) => ({ ...r, room: null })),
    activities: w.activities.map((a) => ({ ...a, relationship_activity_resident: a.relationship_activity_resident.map((x) => ({ ...x, room: null })) })),
  };
}

type Me = { id: string; name: string; active: boolean };
type State = {
  me: Me | null;
  /** Signed in, but no active Iris record (deactivated, or never added). */
  noAccess: boolean;
  monday: string;
  setMonday: (monday: string) => void;
  week: Week | null;
  /** Set when `week` is the copy kept on the phone (no connection). */
  cachedAt: string | null;
  loading: boolean;
  problem: string | null;
  reload: () => Promise<void>;
};

const WeekContext = createContext<State | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [me, setMe] = useState<Me | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [monday, setMonday] = useState(defaultWeek);
  const [week, setWeek] = useState<Week | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setMe(null);
    setWeek(null);
    setNoAccess(false);
    if (!userId) return;
    (async () => {
      // No connection: the person last seen on this phone, at once (net.ts).
      if (await offlineNow()) {
        const saved = await cacheGet<Me>("me");
        if (saved && saved.value.id === userId) return setMe(saved.value);
      }
      const { data, error } = await supabase.from("person").select("id, name, active").eq("id", userId).maybeSingle();
      if (error) {
        // No signal: carry on as the person last seen on this phone.
        const saved = isNetwork(error) ? await cacheGet<Me>("me") : null;
        if (saved && saved.value.id === userId) setMe(saved.value);
        else setProblem(friendly(error));
      } else if (!data || !data.active) {
        // Access ended: nothing of Iris stays on the phone (O9).
        await wipe();
        setNoAccess(true);
      } else {
        // Someone else used this phone before: clear their copy first.
        const owner = await cacheGet<Me>("me");
        if (owner && owner.value.id !== data.id) await wipe();
        await cacheSet("me", data);
        await cacheSet("confirmed_at", new Date().toISOString());
        setMe(data);
      }
    })();
  }, [userId]);

  const reload = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      if (await offlineNow()) throw new Error("Network request failed (offline)");
      const w = await loadWeek(me.id, monday);
      setWeek(w);
      setCachedAt(null);
      setProblem(null);
      cacheSet(`week:${monday}`, forPhone(w));
    } catch (e) {
      const saved = isNetwork(e as { message?: string }) ? await cacheGet<Week>(`week:${monday}`) : null;
      if (saved) {
        setWeek(saved.value);
        setCachedAt(saved.savedAt);
        setProblem(null);
      } else setProblem(friendly(e as { message?: string }));
    } finally {
      setLoading(false);
    }
  }, [me, monday]);

  useEffect(() => {
    reload();
  }, [reload]);

  return <WeekContext.Provider value={{ me, noAccess, monday, setMonday, week, cachedAt, loading, problem, reload }}>{children}</WeekContext.Provider>;
}

export function useWeek(): State {
  const v = useContext(WeekContext);
  if (!v) throw new Error("useWeek outside WeekProvider");
  return v;
}

/** Plain-language messages, the same as the website's (documentation/actions.ts). */
export function friendly(error: { code?: string; message?: string }): string {
  const msg = error.message ?? "";
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23514" && msg) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/network|fetch/i.test(msg)) return "No connection. Check your signal and try again.";
  return "We couldn't do that. Please try again.";
}
