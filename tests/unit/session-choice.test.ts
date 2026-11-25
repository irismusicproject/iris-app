// Which session the phone app trusts on opening (mobile/src/lib/session-choice.ts).
// Pins the Nov 25 fix: offline with an expired access token, a musician stays
// signed in instead of facing a sign-in screen that can't work without signal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseSession } from "../../mobile/src/lib/session-choice.ts";

const saved = { id: "saved" };
const live = { id: "live" };

test("offline with a saved session: the saved one, at once", () => {
  assert.equal(chooseSession({ offline: true, saved, live: null, networkFailure: false }), saved);
});
test("online: the library's live session wins", () => {
  assert.equal(chooseSession({ offline: false, saved, live, networkFailure: false }), live);
});
test("renewal failed only for lack of a connection: still signed in", () => {
  assert.equal(chooseSession({ offline: false, saved, live: null, networkFailure: true }), saved);
});
test("renewal refused (signed out, account ended): signed out", () => {
  assert.equal(chooseSession({ offline: false, saved, live: null, networkFailure: false }), null);
});
test("offline and nothing saved on this phone: signed out", () => {
  assert.equal(chooseSession({ offline: true, saved: null, live: null, networkFailure: true }), null);
});
