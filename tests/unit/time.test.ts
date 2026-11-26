// Dates in a site's own time zone (src/shared/domain/time.ts). Sites span
// Eastern, Central and Arizona time; "today" bugs hid here before (#94, #95).
import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateTime, monthWindow, shiftMonth, todayIn, zonedToUtc } from "../../src/shared/domain/time.ts";

test("an evening in Arizona is still that day there, the next day in UTC", () => {
  const iso = zonedToUtc("2026-12-01", "19:30", "America/Phoenix");
  assert.equal(iso.slice(0, 10), "2026-12-02");
  assert.deepEqual(localDateTime(iso, "America/Phoenix"), { date: "2026-12-01", time: "19:30" });
});
test("the same instant is a different local time in Chicago and New York", () => {
  const iso = zonedToUtc("2026-11-25", "14:00", "America/Chicago");
  assert.equal(localDateTime(iso, "America/New_York").time, "15:00");
});
test("months roll over the year", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
});
test("a month's window covers its first and last local days", () => {
  const w = monthWindow("2026-12");
  assert.ok(w.from <= "2026-12-01T05:00:00.000Z" && w.to >= "2027-01-01T05:00:00.000Z");
});
test("todayIn gives a date, not a time", () => {
  assert.match(todayIn("America/Phoenix"), /^\d{4}-\d{2}-\d{2}$/);
});
