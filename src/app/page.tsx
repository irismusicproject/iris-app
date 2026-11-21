import Link from "next/link";
import { Logo } from "@/components/logo";

export default function Welcome() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Logo className="h-14 w-auto sm:h-16" priority />
        <Link
          href="/login"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-iris-soft"
        >
          Log in
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-iris">
          Staff and volunteers
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Welcome to the Iris Music Project app.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          This is where our team will coordinate programs, people, and
          performances. Log in with the email address Iris has on file for you.
        </p>
        <div className="mt-10">
          <Link
            href="/login"
            className="inline-block rounded-full bg-iris px-6 py-3 font-medium text-white hover:bg-iris-strong dark:text-background"
          >
            Log in
          </Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-muted">
        Iris Music Project · Maryland
      </footer>
    </main>
  );
}
