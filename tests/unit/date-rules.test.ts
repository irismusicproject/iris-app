// What a musician may do on a date's screen during the monthly cycle (D17):
// mobile/src/lib/date-rules.ts. The database enforces the same rules; these
// decide which buttons the phone shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateActions, type DateFacts } from "../../mobile/src/lib/date-rules.ts";

const base: DateFacts = {
  stage: "team_editing", reviewed: false, scheduleState: "draft", iLead: false, adminLead: false,
  myStatus: "assigned", hasLeader: true, nonLeaders: 2, past: false,
};
const on = (f: Partial<DateFacts>) => dateActions({ ...base, ...f });

test("team editing: the date's leader edits its title; others don't", () => {
  assert.equal(on({ iLead: true }).canEditTitle, true);
  assert.equal(on({}).canEditTitle, false);
});
test("a month never opened through the cycle, not reviewed: the leader may still title it (#94)", () => {
  assert.equal(on({ stage: null, iLead: true }).canEditTitle, true);
});
test("once reviewed, the leader can't retitle a month outside the cycle", () => {
  assert.equal(on({ stage: null, reviewed: true, iLead: true }).canEditTitle, false);
});
test("sent to the partner: only the admin lead changes titles, as a partner change", () => {
  assert.deepEqual([on({ stage: "sent_to_partner", iLead: true }).canEditTitle, on({ stage: "sent_to_partner", adminLead: true }).canEditTitle], [false, true]);
  assert.equal(on({ stage: "partner_changes", adminLead: true }).partnerChange, true);
  assert.equal(on({ stage: "team_editing", adminLead: true }).partnerChange, false);
});
test("\"I can't play\": while the team edits, on drafts; not for substitutes", () => {
  assert.equal(on({}).canMarkOff, true);
  assert.equal(on({ myStatus: "absent" }).canMarkOff, true, "to undo the mark");
  assert.equal(on({ myStatus: "substitute" }).canMarkOff, false);
  assert.equal(on({ stage: "team_confirmed" }).canMarkOff, false);
  assert.equal(on({ myStatus: null }).canMarkOff, false);
});
test("leader swap: while the team edits, with a leader and someone to swap with", () => {
  assert.equal(on({}).canSwap, true);
  assert.equal(on({ nonLeaders: 0 }).canSwap, false);
  assert.equal(on({ hasLeader: false }).canSwap, false);
  assert.equal(on({ myStatus: "absent" }).canSwap, false, "marked can't play: no Leader card");
});
test("final: upcoming dates I play take change requests", () => {
  assert.equal(on({ stage: "final" }).afterFinal, true);
  assert.equal(on({ stage: "final", past: true }).afterFinal, false);
});
test("a canceled date (No Program) offers nothing", () => {
  const a = on({ scheduleState: "canceled", iLead: true, adminLead: true });
  assert.deepEqual(Object.values(a), [false, false, false, false, false]);
});
