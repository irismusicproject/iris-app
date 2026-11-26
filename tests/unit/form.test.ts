// Text from web forms (src/shared/domain/form.ts): browsers send line breaks
// as CRLF, which broke matching and length checks (#103).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formText } from "../../src/shared/domain/form.ts";

const form = (v: string | null) => {
  const f = new FormData();
  if (v !== null) f.set("note", v);
  return f;
};

test("Windows and old-Mac line breaks become plain ones", () => {
  assert.equal(formText(form("one\r\ntwo\rthree"), "note"), "one\ntwo\nthree");
});
test("spaces and breaks around the text are trimmed", () => {
  assert.equal(formText(form("  hello\r\n"), "note"), "hello");
});
test("a missing field is an empty string, not 'null'", () => {
  assert.equal(formText(form(null), "note"), "");
});
