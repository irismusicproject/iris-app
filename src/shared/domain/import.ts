// Admin import (DOMAIN-MODEL v0.30): set up people, buildings, programs,
// seasons, rosters and weekly programs from one spreadsheet, before anyone
// is invited. This file defines the spreadsheet's tabs and columns and
// checks it. Native apps can import it.
//
// People are referred to by the Name in the People tab (or an existing
// person's exact name in the app). Email is required for every new person.

export const IMPORT_TABS = {
  people: { name: "People", columns: ["Name", "Email", "Phone", "Instruments", "Employment", "Job title", "Admin"] },
  sites: { name: "Buildings", columns: ["Partner", "Building", "City", "State", "Time zone", "Rooms"] },
  residencies: { name: "Programs", columns: ["Program", "Partner", "Buildings", "Season", "Season starts", "Season ends", "Point person"] },
  roster: { name: "Roster", columns: ["Program", "Musician", "Core", "Admin lead"] },
  weekly: {
    name: "Weekly programs",
    columns: ["Program", "Title", "Building", "Room", "Repeats", "Day", "Week of month", "Start time", "Minutes", "Usual leader", "Usual musicians"],
  },
} as const;
export type TabKey = keyof typeof IMPORT_TABS;
export type RawRow = Record<string, string>;
export type RawImport = Record<TabKey, RawRow[]>;

export type ImportPerson = { name: string; email: string; phone: string | null; instruments: string[]; employment: "contractor_1099" | "employee_w2" | "volunteer"; jobTitle: string | null; admin: boolean };
export type ImportSite = { partner: string; building: string; city: string | null; state: string | null; timezone: string; rooms: string[] };
export type ImportResidency = { residency: string; partner: string; buildings: string[]; season: string; startsOn: string; endsOn: string; pointPerson: string | null };
export type ImportRosterRow = { residency: string; musician: string; core: boolean; adminLead: boolean };
export type ImportWeekly = {
  residency: string;
  title: string;
  building: string;
  room: string;
  recurrence: "weekly" | "monthly";
  weekdays: number[];
  weekOfMonth: number | null;
  startTime: string;
  minutes: number;
  leader: string | null;
  musicians: string[];
};
export type ImportPlan = { people: ImportPerson[]; sites: ImportSite[]; residencies: ImportResidency[]; roster: ImportRosterRow[]; weekly: ImportWeekly[] };
export type ImportProblem = { tab: string; row: number; message: string };

const DAYS: Record<string, number> = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
export const DEFAULT_ROOM = "Program room";

const list = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const yes = (v: string, dflt: boolean) => (v.trim() === "" ? dflt : /^(y|yes|true|x|1)$/i.test(v.trim()));
const key = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** "15:00", "3:00 pm", "3pm", "10:45" → "15:00". */
export function parseTime(v: string): string | null {
  const m = v.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "2027-01-04", "1/4/2027" → "2027-01-04". */
export function parseDate(v: string): string | null {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return null;
}

export function checkImport(raw: RawImport, existingPeople: { name: string; email: string }[]): { plan: ImportPlan; errors: ImportProblem[]; warnings: ImportProblem[] } {
  const errors: ImportProblem[] = [];
  const warnings: ImportProblem[] = [];
  const err = (tab: TabKey, row: number, message: string) => errors.push({ tab: IMPORT_TABS[tab].name, row, message });
  const warn = (tab: TabKey, row: number, message: string) => warnings.push({ tab: IMPORT_TABS[tab].name, row, message });
  const plan: ImportPlan = { people: [], sites: [], residencies: [], roster: [], weekly: [] };

  // People (row numbers are spreadsheet rows: header is row 1).
  const names = new Set(existingPeople.map((p) => key(p.name)));
  const emails = new Set<string>();
  raw.people.forEach((r, i) => {
    const row = i + 2;
    const name = (r["Name"] ?? "").trim();
    const email = (r["Email"] ?? "").trim().toLowerCase();
    if (!name) return err("people", row, "Name is empty.");
    if (!email) return err("people", row, `${name}: add an email (needed to set up their sign-in later).`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("people", row, `${name}: "${email}" isn't an email address.`);
    if (emails.has(email)) return err("people", row, `${name}: ${email} is listed twice.`);
    if (plan.people.some((p) => key(p.name) === key(name))) return err("people", row, `"${name}" is listed twice; add a last name or initial to tell them apart.`);
    emails.add(email);
    const emp = key(r["Employment"] ?? "");
    plan.people.push({
      name,
      email,
      phone: (r["Phone"] ?? "").trim() || null,
      instruments: list(r["Instruments"] ?? ""),
      employment: emp.startsWith("employee") || emp.includes("w2") || emp.includes("w-2") ? "employee_w2" : emp.startsWith("vol") ? "volunteer" : "contractor_1099",
      jobTitle: (r["Job title"] ?? "").trim() || null,
      admin: yes(r["Admin"] ?? "", false),
    });
    names.add(key(name));
  });
  const knownPerson = (n: string) => names.has(key(n));

  // Buildings.
  raw.sites.forEach((r, i) => {
    const row = i + 2;
    const partner = (r["Partner"] ?? "").trim();
    const building = (r["Building"] ?? "").trim();
    if (!partner || !building) return err("sites", row, "Partner and Building are both needed.");
    const rooms = list(r["Rooms"] ?? "");
    if (!rooms.length) warn("sites", row, `${building}: no rooms given; "${DEFAULT_ROOM}" will be used. Rename it later.`);
    plan.sites.push({
      partner,
      building,
      city: (r["City"] ?? "").trim() || null,
      state: (r["State"] ?? "").trim() || null,
      timezone: (r["Time zone"] ?? "").trim() || "America/New_York",
      rooms: rooms.length ? rooms : [DEFAULT_ROOM],
    });
  });
  const siteKey = (partner: string, building: string) => `${key(partner)}|${key(building)}`;
  const sites = new Map(plan.sites.map((s) => [siteKey(s.partner, s.building), s]));

  // Programs (one season each in this file).
  raw.residencies.forEach((r, i) => {
    const row = i + 2;
    const residency = (r["Program"] ?? "").trim();
    const partner = (r["Partner"] ?? "").trim();
    if (!residency || !partner) return err("residencies", row, "Program and Partner are both needed.");
    const buildings = list(r["Buildings"] ?? "");
    if (!buildings.length) return err("residencies", row, `${residency}: list at least one building.`);
    for (const b of buildings) if (!sites.has(siteKey(partner, b))) err("residencies", row, `${residency}: building "${b}" isn't on the Buildings tab for ${partner}.`);
    const startsOn = parseDate(r["Season starts"] ?? "");
    const endsOn = parseDate(r["Season ends"] ?? "");
    if (!startsOn) return err("residencies", row, `${residency}: add the season's start date (e.g. 2027-01-04).`);
    if (!endsOn) return err("residencies", row, `${residency}: add the season's end date.`);
    if (endsOn <= startsOn) return err("residencies", row, `${residency}: the season ends before it starts.`);
    const pointPerson = (r["Point person"] ?? "").trim() || null;
    if (pointPerson && !knownPerson(pointPerson)) err("residencies", row, `${residency}: point person "${pointPerson}" isn't on the People tab.`);
    if (!pointPerson) warn("residencies", row, `${residency}: no point person yet.`);
    if (plan.residencies.some((p) => key(p.residency) === key(residency))) return err("residencies", row, `"${residency}" is listed twice.`);
    plan.residencies.push({ residency: residency, partner, buildings, season: (r["Season"] ?? "").trim() || "Spring 2027", startsOn, endsOn, pointPerson });
  });
  const residencies = new Map(plan.residencies.map((p) => [key(p.residency), p]));

  // Roster.
  raw.roster.forEach((r, i) => {
    const row = i + 2;
    const residency = (r["Program"] ?? "").trim();
    const musician = (r["Musician"] ?? "").trim();
    if (!residencies.has(key(residency))) return err("roster", row, `Program "${residency}" isn't on the Programs tab.`);
    if (!knownPerson(musician)) return err("roster", row, `"${musician}" isn't on the People tab.`);
    plan.roster.push({ residency: residency, musician, core: yes(r["Core"] ?? "", true), adminLead: yes(r["Admin lead"] ?? "", false) });
  });
  for (const p of plan.residencies) {
    const leads = plan.roster.filter((r) => key(r.residency) === key(p.residency) && r.adminLead);
    if (leads.length > 1) errors.push({ tab: IMPORT_TABS.roster.name, row: 0, message: `${p.residency}: only one Admin lead per season.` });
    if (!leads.length) warnings.push({ tab: IMPORT_TABS.roster.name, row: 0, message: `${p.residency}: no Admin lead yet.` });
  }
  const onRoster = (residency: string, person: string) => plan.roster.some((r) => key(r.residency) === key(residency) && key(r.musician) === key(person));

  // Weekly and monthly programs.
  raw.weekly.forEach((r, i) => {
    const row = i + 2;
    const residency = residencies.get(key(r["Program"] ?? ""));
    const title = (r["Title"] ?? "").trim();
    if (!residency) return err("weekly", row, `Program "${(r["Program"] ?? "").trim()}" isn't on the Programs tab.`);
    if (!title) return err("weekly", row, "Title is empty.");
    const building = (r["Building"] ?? "").trim() || residency.buildings[0]!;
    const site = sites.get(siteKey(residency.partner, building));
    if (!site || !residency.buildings.some((b) => key(b) === key(building))) return err("weekly", row, `${title}: building "${building}" isn't one of ${residency.residency}'s buildings.`);
    const room = (r["Room"] ?? "").trim() || site.rooms[0]!;
    if (!site.rooms.some((x) => key(x) === key(room))) warn("weekly", row, `${title}: room "${room}" will be added to ${site.building}.`);
    const weekdays = list(r["Day"] ?? "").map((d) => DAYS[key(d)] ?? DAYS[key(d).slice(0, 3)]);
    if (!weekdays.length || weekdays.some((d) => !d)) return err("weekly", row, `${title}: Day should be Monday–Sunday (several separated by commas).`);
    const recurrence = key(r["Repeats"] ?? "").startsWith("month") ? "monthly" : "weekly";
    const wom = Number((r["Week of month"] ?? "").trim() || 0);
    if (recurrence === "monthly" && !(wom >= 1 && wom <= 4)) return err("weekly", row, `${title}: monthly programs need Week of month 1–4.`);
    const startTime = parseTime(r["Start time"] ?? "");
    if (!startTime) return err("weekly", row, `${title}: Start time should look like 15:00 or 3:00 pm.`);
    const minutesText = (r["Minutes"] ?? "").trim();
    const minutes = minutesText ? Number(minutesText) : 60;
    if (!(minutes >= 5 && minutes <= 600)) return err("weekly", row, `${title}: Minutes should be 5–600.`);
    if (!minutesText) warn("weekly", row, `${title}: no length given; 60 minutes will be used.`);
    const leader = (r["Usual leader"] ?? "").trim() || null;
    const musicians = list(r["Usual musicians"] ?? "");
    for (const n of [...(leader ? [leader] : []), ...musicians])
      if (!onRoster(residency.residency, n)) err("weekly", row, `${title}: "${n}" isn't on ${residency.residency}'s roster.`);
    plan.weekly.push({
      residency: residency.residency,
      title,
      building: site.building,
      room,
      recurrence,
      weekdays: recurrence === "monthly" ? weekdays.slice(0, 1) : [...new Set(weekdays)].sort(),
      weekOfMonth: recurrence === "monthly" ? wom : null,
      startTime,
      minutes,
      leader,
      musicians: [...new Set([...(leader ? [leader] : []), ...musicians])],
    });
  });

  return { plan, errors, warnings };
}
