import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "./session";
import { supabase } from "./supabase";
import { defaultWeek, loadWeek, type Week } from "./week";

// The signed-in person and the week on screen, shared by the My week tab and
// the screens it opens (document a session, log an activity, reflection), so
// a save on one shows up on the others. Kept in memory only.

type Me = { id: string; name: string; active: boolean };
type State = {
  me: Me | null;
  /** Signed in, but no active Iris record (deactivated, or never added). */
  noAccess: boolean;
  monday: string;
  setMonday: (monday: string) => void;
  week: Week | null;
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
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setMe(null);
    setWeek(null);
    setNoAccess(false);
    if (!userId) return;
    supabase
      .from("person")
      .select("id, name, active")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setProblem(friendly(error));
        else if (!data || !data.active) setNoAccess(true);
        else setMe(data);
      });
  }, [userId]);

  const reload = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      setWeek(await loadWeek(me.id, monday));
      setProblem(null);
    } catch (e) {
      setProblem(friendly(e as { message?: string }));
    } finally {
      setLoading(false);
    }
  }, [me, monday]);

  useEffect(() => {
    reload();
  }, [reload]);

  return <WeekContext.Provider value={{ me, noAccess, monday, setMonday, week, loading, problem, reload }}>{children}</WeekContext.Provider>;
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
