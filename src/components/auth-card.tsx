import Link from "next/link";
import { Logo } from "@/components/logo";

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Iris Music Project home" className="inline-block">
          <Logo className="h-16 w-auto" priority />
        </Link>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro && <div className="mt-2 text-sm text-muted">{intro}</div>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && (
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        )}
      </div>
    </main>
  );
}

export const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-base font-normal outline-none focus:border-iris focus:ring-2 focus:ring-iris/30";

export const buttonClass =
  "rounded-full bg-iris px-6 py-3 font-medium text-white hover:bg-iris-strong disabled:opacity-60 dark:text-background";

export const linkClass = "font-medium text-iris hover:text-iris-strong underline-offset-2 hover:underline";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
