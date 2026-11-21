import { MAIL_URL } from "./env";

// Reads emails caught by the local Supabase mail server (Mailpit; older CLIs
// used Inbucket, so both APIs are tried). Nothing is really sent.

type Mail = { subject: string; html: string; text: string };

async function fromMailpit(to: string, since: number): Promise<Mail | null> {
  const res = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { messages?: { ID: string; Subject: string; Created: string }[] };
  const newest = (data.messages ?? [])
    .filter((m) => Date.parse(m.Created) >= since - 1000)
    .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
  if (!newest) return null;
  const full = (await (await fetch(`${MAIL_URL}/api/v1/message/${newest.ID}`)).json()) as {
    HTML: string;
    Text: string;
  };
  return { subject: newest.Subject, html: full.HTML ?? "", text: full.Text ?? "" };
}

async function fromInbucket(to: string, since: number): Promise<Mail | null> {
  const box = to.split("@")[0];
  const res = await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(box)}`);
  if (!res.ok) return null;
  const list = (await res.json()) as { id: string; subject: string; date: string }[];
  const newest = list
    .filter((m) => Date.parse(m.date) >= since - 1000)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  if (!newest) return null;
  const full = (await (await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(box)}/${newest.id}`)).json()) as {
    body: { html: string; text: string };
  };
  return { subject: newest.subject, html: full.body.html ?? "", text: full.body.text ?? "" };
}

/** Waits for the newest email to `to` received after `since` (ms). */
export async function waitForEmail(to: string, since: number, timeoutMs = 20_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = (await fromMailpit(to, since).catch(() => null)) ?? (await fromInbucket(to, since).catch(() => null));
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} within ${timeoutMs / 1000}s`);
}

export function confirmLink(mail: Mail): string {
  const m = mail.html.match(/href="([^"]*\/auth\/confirm[^"]*)"/);
  if (!m) throw new Error(`No /auth/confirm link in email "${mail.subject}"`);
  return m[1].replace(/&amp;/g, "&");
}

export function signInCode(mail: Mail): string {
  const m = (mail.text || mail.html).match(/\b(\d{6,10})\b/);
  if (!m) throw new Error(`No code in email "${mail.subject}"`);
  return m[1];
}
