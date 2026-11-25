// Which sign-in session the app trusts when it opens (D18, OFFLINE-SPEC O8).
// Kept free of imports so tests/unit/session-choice.test.ts can check it with
// plain Node, no phone needed.
//
// - Offline, with a session saved on the phone: use it at once. Asking the
//   sign-in library first means waiting ~30 s on its renewal retries.
// - Otherwise the library's answer wins.
// - The library says "no session" only because renewal failed for lack of a
//   connection: the saved session still stands (the outbox enforces 14 days).
// - Any other "no session" (signed out, renewal refused): signed out.
export function chooseSession<S>(o: { offline: boolean; saved: S | null; live: S | null; networkFailure: boolean }): S | null {
  if (o.offline && o.saved) return o.saved;
  if (o.live) return o.live;
  if (o.networkFailure) return o.saved;
  return null;
}
