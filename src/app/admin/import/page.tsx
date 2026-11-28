import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { IMPORT_TABS } from "@/shared/domain/import";
import { ImportForm } from "./import-form";

// Import (admins, v0.30): set up people, buildings, programs, seasons,
// rosters and weekly programs from one spreadsheet, without inviting anyone.
export const metadata = { title: "Import · Iris Music Project" };

export default async function ImportPage() {
  const { isAdmin } = await requireAdmin();
  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
      <p className="mt-1 text-muted">
        Set up people, buildings, programs, seasons, rosters and weekly programs from one spreadsheet. <strong>Nobody is emailed:</strong>{" "}
        people are added without an invite, and you invite them from People when you&apos;re ready.
      </p>

      <section className={card}>
        <h2 className="text-lg font-semibold">Upload</h2>
        <p className="mt-1 text-sm text-muted">
          Check the file first; Import unlocks when there are no problems. Running the same file again only adds what&apos;s missing.
        </p>
        <div className="mt-4">
          <ImportForm />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">The spreadsheet</h2>
        <p className="mt-1 text-sm">
          <a href="/admin/import/template" className="font-medium text-iris hover:underline">Download the template</a> (made-up example rows to replace).
          One tab each:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {Object.values(IMPORT_TABS).map((t) => (
            <li key={t.name}>
              <span className="font-medium">{t.name}:</span> <span className="text-muted">{t.columns.join(", ")}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Everyone needs a name and email. Last names are optional; a first name is fine if it&apos;s unique in the file.</li>
          <li>Other tabs refer to people by the name on the People tab, and to buildings by their name on the Buildings tab.</li>
          <li>Programs: one season each, with start and end dates (e.g. 2027-01-04). Iris Supervisor and Lead Musician can be left empty.</li>
          <li>Weekly programs: Day is Monday–Sunday (several separated by commas); Repeats is Weekly or Monthly (with Week of month 1–4).</li>
        </ul>
      </section>
    </AppShell>
  );
}
