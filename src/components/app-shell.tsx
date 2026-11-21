import Link from "next/link";
import { Logo } from "@/components/logo";

export function AppShell({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const nav = "rounded-full px-3 py-1.5 hover:bg-iris-soft";
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/dashboard" aria-label="Iris Music Project home">
            <Logo className="h-11 w-auto" priority />
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <Link href="/dashboard" className={nav}>Home</Link>
            <Link href="/residencies" className={nav}>Programs</Link>
            {isAdmin && <Link href="/admin/people" className={nav}>People</Link>}
            {isAdmin && <Link href="/admin/partners" className={nav}>Partners</Link>}
            <Link href="/account/profile" className={nav}>My profile</Link>
            <form action="/auth/signout" method="post">
              <button className={nav}>Log out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint && !error && <span className="text-xs font-normal text-muted">{hint}</span>}
      {error && <span className="text-xs font-normal text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
