// Where the website's emails may go (Ryan, Nov 25, 2026). Staging (Vercel
// previews) holds only fake people at @example.com; real email to them would
// bounce, and bounces hurt the sending reputation of mail.irismusicproject.org,
// which production's own emails depend on. So on staging every email goes to
// ONE test inbox, STAGING_EMAIL_TO, and says whom it was meant for. With no
// STAGING_EMAIL_TO, staging sends nothing at all. Production and the local
// prototype are untouched. No imports, so tests/unit/email-redirect.test.ts
// checks it with plain Node.

export type Outgoing = { to: string[]; cc: string[]; subject: string; text: string };

export function routeEmail(m: Outgoing, env: { vercelEnv?: string; redirectTo?: string }): { send: true; email: Outgoing } | { send: false; reason: string } {
  if (env.vercelEnv !== "preview") return { send: true, email: m };
  const inbox = env.redirectTo?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) {
    return { send: false, reason: "Staging sends email only to the test inbox in STAGING_EMAIL_TO, and it isn't set (README, \"Email (Resend)\")." };
  }
  const meant = [`To: ${m.to.join(", ")}`, ...(m.cc.length ? [`Cc: ${m.cc.join(", ")}`] : [])].join("\n");
  return {
    send: true,
    email: {
      to: [inbox],
      cc: [],
      subject: `[staging → ${m.to.join(", ")}] ${m.subject}`,
      text: `STAGING TEST EMAIL. On the live site this would have gone to:\n${meant}\n\n----------\n\n${m.text}`,
    },
  };
}
