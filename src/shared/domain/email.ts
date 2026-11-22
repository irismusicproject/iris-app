// Email checks shared by web and native (v0.32). Pure logic, no I/O.

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Common misspellings of popular email domains → the likely intended one.
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com", "gmal.com": "gmail.com", "gmali.com": "gmail.com", "gmail.comm": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.con": "outlook.com",
  "iclod.com": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com",
  "aol.con": "aol.com", "comcast.ner": "comcast.net", "verizon.ner": "verizon.net",
};

/** A gentle "did you mean …?" for likely typos, or null. */
export function emailTypoHint(email: string): string | null {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const domain = e.slice(at + 1);
  const fix = DOMAIN_TYPOS[domain] ?? (/\.(con|cmo|ocm|comm|cim)$/.test(domain) ? domain.replace(/\.[a-z]+$/, ".com") : null);
  return fix ? `${e.slice(0, at)}@${fix}` : null;
}
