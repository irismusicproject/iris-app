// The 14 days a phone may keep saving work offline (OFFLINE-SPEC O8, D18):
// mobile/src/lib/offline/sign-in-limit.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signInNeeded } from "../../mobile/src/lib/offline/sign-in-limit.ts";

const now = Date.parse("2026-12-15T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

test("online: never asks, whatever the date", () => {
  assert.equal(signInNeeded({ online: true, confirmedAt: null, maxDays: 14, now }), false);
});
test("offline, 13 days since Iris last answered: keeps saving", () => {
  assert.equal(signInNeeded({ online: false, confirmedAt: daysAgo(13), maxDays: 14, now }), false);
});
test("offline, exactly 14 days: still keeps saving", () => {
  assert.equal(signInNeeded({ online: false, confirmedAt: daysAgo(14), maxDays: 14, now }), false);
});
test("offline, 15 days (Violet's journey): stops saving new work", () => {
  assert.equal(signInNeeded({ online: false, confirmedAt: daysAgo(15), maxDays: 14, now }), true);
});
test("offline and never confirmed on this phone: stops", () => {
  assert.equal(signInNeeded({ online: false, confirmedAt: null, maxDays: 14, now }), true);
});
test("an admin-set limit (the offline_signin_max_days setting) is used", () => {
  assert.equal(signInNeeded({ online: false, confirmedAt: daysAgo(8), maxDays: 7, now }), true);
});
