import "server-only";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { IMPORT_TABS, type RawImport, type TabKey } from "@/shared/domain/import";

// Reads and writes the admin import spreadsheet (v0.29).

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Excel times come back as dates on Dec 30/31, 1899.
    if (v.getUTCFullYear() < 1901) return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
    return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

export async function readImportFile(buffer: Buffer): Promise<{ raw: RawImport; missingTabs: string[] }> {
  const sheets = await readXlsxFile(buffer);
  const raw = { people: [], sites: [], programs: [], roster: [], weekly: [] } as RawImport;
  const missingTabs: string[] = [];
  for (const k of Object.keys(IMPORT_TABS) as TabKey[]) {
    const tab = IMPORT_TABS[k];
    const sheet = sheets.find((s) => s.sheet.trim().toLowerCase() === tab.name.toLowerCase());
    if (!sheet) {
      missingTabs.push(tab.name);
      continue;
    }
    const [header, ...rows] = sheet.data;
    const titles = (header ?? []).map(cellText);
    raw[k] = rows
      .map((r) => Object.fromEntries(titles.map((t, i) => [t, cellText(r[i])])))
      .filter((r) => Object.values(r).some((v) => v !== ""));
  }
  return { raw, missingTabs };
}

/** An empty import file with example rows (made-up), for the admin to fill in. */
export async function importTemplate(): Promise<Buffer> {
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const examples: Record<TabKey, string[][]> = {
    people: [
      ["Ana Rivera", "ana@example.com", "555-0131", "Violin, Viola", "Contractor", "", "No"],
      ["Paz Point", "paz@example.com", "555-0102", "", "Employee", "Program Manager", "Yes"],
    ],
    sites: [["Example Senior Living", "Maple House", "Testville", "MD", "America/New_York", "Auditorium, Chapel"]],
    programs: [["Maple House", "Example Senior Living", "Maple House", "Spring 2027", "2027-01-04", "2027-05-31", "Paz Point"]],
    roster: [["Maple House", "Ana Rivera", "Yes", "Yes"]],
    weekly: [["Maple House", "Orchestra", "Maple House", "Auditorium", "Weekly", "Tuesday", "", "4:00 pm", "60", "Ana Rivera", ""]],
  };
  const sheets = (Object.keys(IMPORT_TABS) as TabKey[]).map((k) => ({
    sheet: IMPORT_TABS[k].name,
    data: [IMPORT_TABS[k].columns.map((c) => bold(c)), ...examples[k].map((row) => row.map((value) => ({ value })))],
    columns: IMPORT_TABS[k].columns.map(() => ({ width: 22 })),
  }));
  return writeXlsxFile(sheets).toBuffer();
}
