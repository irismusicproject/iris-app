// OFFLINE-SPEC O8 (D18, Lauren, Nov 23, 2026): a phone keeps saving work
// offline for `maxDays` (14) after it last reached Iris with an accepted
// sign-in; after that it keeps what it has but saves nothing new until it
// connects. Online, the database checks everything anyway. No imports, so
// tests/unit/sign-in-limit.test.ts checks it with plain Node.
const DAY_MS = 86_400_000;

export function signInNeeded(o: { online: boolean; confirmedAt: string | null; maxDays: number; now?: number }): boolean {
  if (o.online) return false;
  if (!o.confirmedAt) return true;
  return (o.now ?? Date.now()) - new Date(o.confirmedAt).getTime() > o.maxDays * DAY_MS;
}
