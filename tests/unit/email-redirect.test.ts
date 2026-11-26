// Where the website's emails may go (src/lib/email-redirect.ts): staging
// never emails its fake @example.com people; everything goes to one test inbox.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEmail } from "../../src/lib/email-redirect.ts";

const mail = { to: ["violet.viola@example.com"], cc: ["point.person@example.com"], subject: "Reminder: due tomorrow", text: "Hello" };

test("production sends exactly as written", () => {
  assert.deepEqual(routeEmail(mail, { vercelEnv: "production", redirectTo: "tester@gmail.com" }), { send: true, email: mail });
});
test("the local prototype (no Vercel) is untouched too", () => {
  assert.deepEqual(routeEmail(mail, {}), { send: true, email: mail });
});
test("staging without a test inbox sends nothing", () => {
  const r = routeEmail(mail, { vercelEnv: "preview" });
  assert.equal(r.send, false);
  assert.match(r.send ? "" : r.reason, /STAGING_EMAIL_TO/);
});
test("staging with a malformed test inbox sends nothing", () => {
  assert.equal(routeEmail(mail, { vercelEnv: "preview", redirectTo: "not an address" }).send, false);
});
test("staging sends to the test inbox only, with no cc", () => {
  const r = routeEmail(mail, { vercelEnv: "preview", redirectTo: " tester@gmail.com " });
  assert.ok(r.send);
  if (!r.send) return;
  assert.deepEqual(r.email.to, ["tester@gmail.com"]);
  assert.deepEqual(r.email.cc, []);
});
test("…and says whom it was meant for, in the subject and the body", () => {
  const r = routeEmail(mail, { vercelEnv: "preview", redirectTo: "tester@gmail.com" });
  if (!r.send) return assert.fail("should send");
  assert.equal(r.email.subject, "[staging → violet.viola@example.com] Reminder: due tomorrow");
  assert.match(r.email.text, /To: violet\.viola@example\.com\nCc: point\.person@example\.com/);
  assert.match(r.email.text, /Hello$/);
});
