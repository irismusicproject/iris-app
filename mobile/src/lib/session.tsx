import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { offlineNow } from "./net";
import { secureStorage } from "./secure-storage";
import { supabase } from "./supabase";

// Who is signed in, shared with every screen. `loading` is true until the
// saved session (if any) has been read from the secure store.

type SessionState = { session: Session | null; loading: boolean };
const SessionContext = createContext<SessionState>({ session: null, loading: true });

// The session saved on this phone, as the Supabase library stored it.
async function savedSession(): Promise<Session | null> {
  const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
  if (!key) return null;
  try {
    const raw = await secureStorage.getItem(key);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.access_token && s.refresh_token && s.user ? s : null;
  } catch {
    return null;
  }
}

// Offline work (D18, OFFLINE-SPEC O8): the phone keeps working for 14 days
// without signal. The access token inside a session lasts about an hour; when
// it has expired, getSession() tries to renew it over the network and, with no
// signal, reports "no session" although the session is still saved. That sent
// a musician opening the app in a basement to a sign-in screen she couldn't
// use (Violet's phone journey, Nov 25). So when renewal fails only for lack of
// a connection, keep the saved session: the outbox enforces the 14 days, and
// the library renews the token as soon as the phone is back online. A refused
// renewal (account ended, session revoked) still signs the person out.
async function loadSession(): Promise<Session | null> {
  // No connection: don't wait out the library's renewal retries (net.ts).
  if (await offlineNow()) {
    const saved = await savedSession();
    if (saved) return saved;
  }
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return data.session;
  if (error && isAuthRetryableFetchError(error)) return savedSession();
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    loadSession().then((session) => setState({ session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // The first event repeats getSession()'s answer, without the offline
      // fallback above; loadSession() covers it.
      if (event === "INITIAL_SESSION") return;
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
