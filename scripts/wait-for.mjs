#!/usr/bin/env node
// Wait for a build or workflow, with a time limit, asking the system that
// actually knows the answer. Written after two waits in one session hung:
// one loop used a gh option that doesn't exist and kept retrying the error,
// the other watched a GitHub list that never showed what it waited for.
//
// Rules this script follows (and anyone writing a wait by hand should too):
//   1. Ask the source of truth: Vercel's own status on the commit, or the
//      workflow run itself, not a side signal.
//   2. Stop on ANY error from the command used to check, instead of looping on it.
//   3. Always give up after a time limit, and say so plainly.
//   4. Print progress every minute, so a long wait is visibly alive.
//
// Usage:
//   node scripts/wait-for.mjs vercel <commit-sha> [minutes]   # Vercel build of that commit
//   node scripts/wait-for.mjs run <run-id> [minutes]          # a GitHub Actions run
//   node scripts/wait-for.mjs eas <build-id> [minutes]        # an Expo (EAS) build of the phone app
// Exit code: 0 = finished successfully, 1 = failed, 2 = timed out or couldn't check.

import { execFileSync } from "node:child_process";

const REPO = "irismusicproject/iris-app";
const [kind, target, minutesArg] = process.argv.slice(2);
const limitMs = Number(minutesArg ?? 15) * 60_000;

if (!["vercel", "run", "eas"].includes(kind) || !target) {
  console.error("usage: node scripts/wait-for.mjs vercel <commit-sha> [minutes] | run <run-id> [minutes] | eas <build-id> [minutes]");
  process.exit(2);
}

function exec(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const why = (e.stderr?.toString() || e.message).trim().split("\n")[0];
    console.error(`x couldn't check: ${cmd} ${args.join(" ")}\n  Why: ${why}`);
    process.exit(2); // rule 2: never loop on an error
  }
}
const gh = (args) => exec("gh", args);

// One check: returns "pending", "success" or "failure" (plus a detail line).
function check() {
  if (kind === "vercel") {
    const json = JSON.parse(gh(["api", `repos/${REPO}/commits/${target}/status`]));
    const v = json.statuses.find((s) => s.context === "Vercel");
    if (!v) return ["pending", "Vercel hasn't reported on this commit yet"];
    if (v.state === "success") return ["success", v.target_url];
    // vercel.json skips website builds when only mobile/ changed; that counts as done.
    if (/ignored|skipped|canceled/i.test(v.description ?? "")) return ["success", `skipped: ${v.description}`];
    if (v.state === "failure" || v.state === "error") return ["failure", `${v.description ?? ""} ${v.target_url}`];
    return ["pending", v.description ?? "building"];
  }
  if (kind === "eas") {
    const b = JSON.parse(exec("npx", ["eas-cli@latest", "build:view", target, "--json"], new URL("../mobile/", import.meta.url).pathname));
    const page = `https://expo.dev/accounts/iris-music-project/projects/iris-app/builds/${target}`;
    if (b.status === "FINISHED") return ["success", b.artifacts?.buildUrl ?? page];
    if (["ERRORED", "CANCELED"].includes(b.status)) return ["failure", `${b.status.toLowerCase()} ${page}`];
    return ["pending", `${b.status.toLowerCase()} ${page}`];
  }
  const run = JSON.parse(gh(["run", "view", target, "--repo", REPO, "--json", "status,conclusion,url"]));
  if (run.status !== "completed") return ["pending", `${run.status} ${run.url}`];
  return [run.conclusion === "success" ? "success" : "failure", `${run.conclusion} ${run.url}`];
}

const start = Date.now();
let lastReport = 0;
for (;;) {
  const [state, detail] = check();
  const mins = ((Date.now() - start) / 60_000).toFixed(1);
  if (state === "success") { console.log(`✓ done after ${mins} min: ${detail}`); process.exit(0); }
  if (state === "failure") { console.error(`x failed after ${mins} min: ${detail}`); process.exit(1); }
  if (Date.now() - start > limitMs) { console.error(`x gave up after ${mins} min, still: ${detail}`); process.exit(2); }
  if (Date.now() - lastReport > 60_000) { console.log(`… ${mins} min: ${detail}`); lastReport = Date.now(); }
  await new Promise((r) => setTimeout(r, 15_000));
}
