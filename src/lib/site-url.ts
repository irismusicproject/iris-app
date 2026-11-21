import "server-only";

/**
 * The address email links should point back to.
 *
 * Production sets NEXT_PUBLIC_SITE_URL (https://app.irismusicproject.org).
 * Vercel previews leave it unset and use their own branch address, so an
 * invite or reset sent from a preview opens that same preview, which talks
 * to the staging database (see README, "Staging database").
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** A link to /auth/confirm that lands on `next` after the email is verified. */
export function confirmUrl(next: string): string {
  return `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}
