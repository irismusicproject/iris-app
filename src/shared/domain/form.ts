// Reading text fields from submitted forms (server actions).

/**
 * A form field's text, trimmed, with line breaks as "\n".
 *
 * Browsers submit a text box's line breaks as "\r\n" (two characters), while
 * the text box itself, the phone app and our length limits count one. So a
 * long note that fit the box could be refused by the database near its
 * limit, and the website and phone stored notes differently (found by the
 * Harper persona test, Nov 25, 2026).
 */
export function formText(f: FormData, key: string): string {
  return String(f.get(key) ?? "").replace(/\r\n?/g, "\n").trim();
}
