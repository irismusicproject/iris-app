#!/usr/bin/env node
// Turns the overnight test's raw results (overnight-results/raw/*.json, from
// e2e/overnight/matrix.spec.ts) into one Markdown report:
//   overnight-results/report.md
// The nightly workflow posts it as a GitHub issue. See README, "Overnight testing".
//
//   node scripts/overnight-report.mjs [--run-url URL] [--site URL]

import fs from "node:fs";
import path from "node:path";

const RESULTS = "overnight-results";
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const runUrl = arg("--run-url");
const site = arg("--site");
const MAX_BODY = 60_000; // GitHub issues stop at 65,536 characters

const PUBLIC = new Set(["/", "/login", "/login/code", "/forgot-password"]);
const PERSONA_ORDER = ["signed-out", "admin", "point-person", "admin-lead", "musician", "substitute", "deactivated"];

const rawDir = path.join(RESULTS, "raw");
const results = fs.existsSync(rawDir)
  ? fs
      .readdirSync(rawDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf8")))
  : [];
const routeMap = fs.existsSync(path.join(RESULTS, "routes.json"))
  ? JSON.parse(fs.readFileSync(path.join(RESULTS, "routes.json"), "utf8"))
  : null;

const byProject = (p) =>
  results
    .filter((r) => r.project === p)
    .sort((a, b) => PERSONA_ORDER.indexOf(a.persona) - PERSONA_ORDER.indexOf(b.persona));
const desktop = byProject("desktop");
const phone = byProject("phone");
const all = [...desktop, ...phone];
const visits = all.flatMap((r) => r.visits.map((v) => ({ ...v, persona: r.persona, label: r.label, project: r.project })));

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (s) => "`" + String(s).replace(/`/g, "'") + "`";

// --- Permission matrix ---------------------------------------------------------------
function cell(v) {
  if (!v) return "–";
  switch (v.outcome) {
    case "allowed":
      return "✅";
    case "redirected":
      return `↪ ${esc(v.final_path)}`;
    case "not-found":
      return "🚫 404";
    case "error":
      return `❌ ${v.status ?? "error"}`;
    default:
      return "·";
  }
}

// Cheap checks that need no expectations file: non-admins on /admin pages,
// and signed-out visitors on private pages, should never be "allowed".
function suspicious(v, persona) {
  if (v.outcome !== "allowed") return false;
  if (persona === "signed-out") return !PUBLIC.has(v.pattern);
  if (v.pattern.startsWith("/admin") && persona !== "admin") return true;
  return false;
}

function matrix(rows) {
  if (!rows.length) return "_No results._\n";
  const patterns = routeMap?.routes.map((r) => r.pattern) ?? [...new Set(rows.flatMap((r) => r.visits.map((v) => v.pattern)))];
  const head = `| Page | ${rows.map((r) => esc(r.label)).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|\n`;
  const body = patterns
    .map((p) => {
      const cells = rows.map((r) => {
        if (r.login !== "ok" && r.login !== "signed-out") return r.login === "blocked" ? "🔒" : "⚠ login failed";
        const v = r.visits.find((x) => x.pattern === p);
        return cell(v) + (v && suspicious(v, r.persona) ? " ⚠" : "");
      });
      return `| ${code(p)} | ${cells.join(" | ")} |`;
    })
    .join("\n");
  return head + body + "\n";
}

// --- Summary numbers -------------------------------------------------------------------
const flagged = visits.filter((v) => suspicious(v, v.persona));
const errors = visits.filter((v) => v.outcome === "error");
const loginProblems = all.filter(
  (r) => (r.persona === "deactivated" && r.login === "ok") || (r.persona !== "deactivated" && r.persona !== "signed-out" && r.login !== "ok"),
);
const a11y = new Map();
for (const v of visits) {
  for (const x of v.a11y ?? []) {
    const e = a11y.get(x.id) ?? { ...x, pages: new Set(), nodes: 0 };
    e.pages.add(v.pattern);
    e.nodes += x.nodes;
    a11y.set(x.id, e);
  }
}
const IMPACT = ["critical", "serious", "moderate", "minor", null];
const a11yRows = [...a11y.values()].sort((a, b) => IMPACT.indexOf(a.impact) - IMPACT.indexOf(b.impact) || b.pages.size - a.pages.size);
const consoleRows = visits.filter((v) => v.console_errors?.length);
const failedRows = visits.filter((v) => v.failed_requests?.length);
const timed = visits.filter((v) => v.outcome === "allowed" && typeof v.load_ms === "number");
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// --- Write it ----------------------------------------------------------------------------
const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long" }).format(new Date());
let md = `# Overnight test report, ${date}\n\n`;
md += `Automated, read-only check of the **staging** site${site ? ` (${site})` : ""}: every page × every test persona, on desktop and phone. `;
md += runUrl ? `Screenshots and raw data: the **overnight-results** artifact on [this run](${runUrl}).\n\n` : "\n\n";

if (!results.length) {
  md += "> [!WARNING]\n> No results were recorded. The test didn't get as far as visiting pages: check the run's log (sign-in, the Vercel bypass secret, or the staging site being down).\n";
} else {
  md += `## At a glance\n\n`;
  md += `| | |\n|---|---|\n`;
  md += `| Pages found | ${routeMap ? `${routeMap.routes.filter((r) => r.url).length} of ${routeMap.routes.length}` : "?"} |\n`;
  md += `| Page visits | ${visits.filter((v) => v.outcome !== "skipped").length} |\n`;
  md += `| ⚠ Possible permission problems | ${flagged.length} |\n`;
  md += `| Sign-in surprises | ${loginProblems.length} |\n`;
  md += `| ❌ Pages that errored | ${errors.length} |\n`;
  md += `| Accessibility rules broken | ${a11yRows.length} (${a11yRows.filter((r) => r.impact === "critical" || r.impact === "serious").length} critical or serious) |\n`;
  md += `| Visits with console errors | ${consoleRows.length} |\n`;
  md += `| Visits with failed requests | ${failedRows.length} |\n`;
  md += `| Median load time (desktop / phone) | ${median(timed.filter((v) => v.project === "desktop").map((v) => v.load_ms)) ?? "?"} ms / ${median(timed.filter((v) => v.project === "phone").map((v) => v.load_ms)) ?? "?"} ms |\n\n`;

  if (flagged.length || loginProblems.length) {
    md += `## ⚠ Look at these first\n\n`;
    for (const r of loginProblems) {
      md += `- **${esc(r.label)}** (${r.project}): sign-in was **${r.login}**${r.persona === "deactivated" ? ", but a deactivated person should be blocked" : ""}.\n`;
    }
    for (const v of flagged) {
      md += `- **${esc(v.label)}** (${v.project}) could open ${code(v.url)}${v.heading ? ` ("${esc(v.heading)}")` : ""}. Check whether that's intended.\n`;
    }
    md += "\n";
  }

  md += `## Permission matrix (desktop)\n\n`;
  md += `✅ allowed · ↪ redirected to · 🚫 not found · ❌ error · 🔒 sign-in blocked · · no example address found · ⚠ check this\n\n`;
  md += matrix(desktop);
  if (routeMap) {
    const missing = routeMap.routes.filter((r) => !r.url);
    if (missing.length) {
      md += `\nNot tested (no persona could reach a link to them): ${missing.map((r) => code(r.pattern)).join(", ")}\n`;
    }
  }
  const differs = desktop.flatMap((d) => {
    const p = phone.find((x) => x.persona === d.persona);
    if (!p) return [];
    return d.visits
      .map((v) => [v, p.visits.find((x) => x.pattern === v.pattern)])
      .filter(([a, b]) => b && a.outcome !== b.outcome)
      .map(([a, b]) => `- ${esc(d.label)}, ${code(a.pattern)}: desktop ${cell(a)}, phone ${cell(b)}`);
  });
  md += `\n### Phone\n\n${differs.length ? "Differs from desktop here:\n\n" + differs.join("\n") + "\n" : "Same outcomes as desktop.\n"}\n`;

  md += `## Errors\n\n`;
  md += errors.length
    ? errors.map((v) => `- ${esc(v.label)} (${v.project}) ${code(v.url)}: ${v.status ?? ""} ${esc(v.note ?? v.heading ?? "")}`).join("\n") + "\n\n"
    : "None.\n\n";

  md += `## Accessibility (WCAG 2.1 A/AA, axe-core)\n\n`;
  md += a11yRows.length
    ? `| Impact | Rule | Pages | Elements | Example |\n|---|---|---|---|---|\n` +
      a11yRows
        .map(
          (r) =>
            `| ${r.impact ?? "?"} | [${esc(r.help)}](${r.help_url}) (${code(r.id)}) | ${r.pages.size}: ${[...r.pages].slice(0, 4).map(code).join(", ")}${r.pages.size > 4 ? "…" : ""} | ${r.nodes} | ${r.targets[0] ? code(r.targets[0]) : ""} |`,
        )
        .join("\n") +
      "\n\n"
    : "No violations found.\n\n";

  const group = (rows, key) => {
    const m = new Map();
    for (const v of rows) for (const msg of v[key]) {
      const e = m.get(msg) ?? new Set();
      e.add(`${v.pattern} (${v.label}, ${v.project})`);
      m.set(msg, e);
    }
    return [...m.entries()].sort((a, b) => b[1].size - a[1].size);
  };
  md += `## Browser console errors\n\n`;
  const cons = group(consoleRows, "console_errors");
  md += cons.length
    ? cons.slice(0, 30).map(([msg, where]) => `- ${code(msg)}\n  ${where.size} visit(s), e.g. ${esc([...where][0])}`).join("\n") + "\n\n"
    : "None.\n\n";

  md += `## Failed network requests\n\n`;
  const fails = group(failedRows, "failed_requests");
  md += fails.length
    ? fails.slice(0, 30).map(([msg, where]) => `- ${code(msg)}\n  ${where.size} visit(s), e.g. ${esc([...where][0])}`).join("\n") + "\n\n"
    : "None.\n\n";

  md += `## Load times\n\n`;
  md += `Time until the page's load event, from the browser's own timing. Staging runs on preview hardware with a cold start now and then, so read trends, not single numbers.\n\n`;
  const slow = [...timed].sort((a, b) => b.load_ms - a.load_ms).slice(0, 10);
  md += slow.length
    ? `| Page | Persona | Device | Load (ms) | DOM ready (ms) |\n|---|---|---|---|---|\n` +
      slow.map((v) => `| ${code(v.url)} | ${esc(v.label)} | ${v.project} | ${v.load_ms} | ${v.dom_ms ?? ""} |`).join("\n") +
      "\n\n"
    : "No timings.\n\n";

  md += `## How to read this\n\n`;
  md += `- The matrix shows what happened, not what should happen. Compare each column with the roles in \`docs/DOMAIN-MODEL.md\`. ⚠ marks only two simple rules: non-admins opening \`/admin\` pages, and signed-out visitors opening private pages.\n`;
  md += `- Each dynamic page (like \`/residencies/[id]\`) is tested at one real address, preferably one a musician persona can reach.\n`;
  md += `- Screenshots are in the artifact under \`screenshots/<device>/<persona>/\`. Real email addresses and phone numbers are blacked out.\n`;
}

fs.mkdirSync(RESULTS, { recursive: true });
// The full version, never cut, stays in the artifact.
fs.writeFileSync(path.join(RESULTS, "report-full.md"), md);
if (md.length > MAX_BODY) {
  md = md.slice(0, MAX_BODY) + `\n\n…cut here: the report is longer than a GitHub issue allows. The full report is \`report-full.md\` in the artifact.\n`;
}
fs.writeFileSync(path.join(RESULTS, "report.md"), md);
console.log(md);
