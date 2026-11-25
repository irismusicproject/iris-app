// After Fern's journeys (fern-no-lock.yaml, fern-offline.yaml): asks STAGING
// what actually arrived, which the phone screens alone can't prove.
//   O3: the log made with no screen lock never arrives (nothing was kept).
//   O1, O2: the log saved offline arrives exactly once.
// Then deletes this run's records, so staging doesn't fill up with test logs.
//
// Needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// STAGING_TEST_PASSWORD, MAESTRO_FERN_EMAIL, MAESTRO_RUN. Staging only.
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, STAGING_TEST_PASSWORD: password, MAESTRO_FERN_EMAIL: email, MAESTRO_RUN: run } = process.env;
if (!url.includes("njdxogunlmhllzqhswkv")) throw new Error("check-offline-sent only runs against the staging project");
if (!key || !password || !email || !run) throw new Error("missing a setting (see the top of this file)");

// Signed in as Fern herself: she can read and delete her own logs.
const fern = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: signInError } = await fern.auth.signInWithPassword({ email, password });
if (signInError) throw new Error(`sign-in as Fern: ${signInError.message}`);

const count = async (marker) => {
  const { data, error } = await fern.from("relationship_activity").select("id").like("note", `[phone test ${run}] ${marker}`);
  if (error) throw new Error(`reading logs: ${error.message}`);
  return data;
};

const noLock = await count("no lock");
const offline = await count("offline");
const problems = [];
if (noLock.length !== 0) problems.push(`O3: the log made with no screen lock arrived ${noLock.length} time(s); it should never arrive`);
if (offline.length !== 1) problems.push(`O1/O2: the log saved offline arrived ${offline.length} time(s); it should arrive exactly once`);

// The same delete the app's "Delete" on My week uses.
for (const { id } of [...noLock, ...offline]) {
  const { error } = await fern.from("relationship_activity").delete().eq("id", id);
  if (error) console.log(`note: couldn't delete test log ${id}: ${error.message}`);
}

if (problems.length) {
  console.error(problems.map((p) => `x ${p}`).join("\n"));
  process.exit(1);
}
console.log("✓ O3: nothing arrived from the phone without a screen lock");
console.log("✓ O1, O2: the offline log arrived exactly once");
