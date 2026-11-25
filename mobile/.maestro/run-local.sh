#!/usr/bin/env bash
# Run phone journeys on this Mac's iPhone simulator, in a minute or two each,
# instead of a 40-minute GitHub run (Ryan, Nov 25, 2026). Use it to get a
# journey passing; GitHub's Android run is the final check, not the debugger.
#
#   mobile/.maestro/run-local.sh tour            one journey
#   mobile/.maestro/run-local.sh tour gus dex    several
#   mobile/.maestro/run-local.sh --list          the journey names
#
# Journeys: tour, cant-play, dex, gus. Not here: vera (largest text) and
# fern-no-lock,
# fern-offline and violet-*, which switch airplane mode or move the phone's
# clock (the iPhone simulator can do neither); run them on GitHub with
# "journeys: fern,violet" (Actions -> Phone journeys -> Run workflow).
#
# Needs, once: Java and Maestro (installed Nov 25; ~/.zshrc puts them on the
# PATH), the GitHub CLI signed in (for the staging address and public key,
# repository variables), STAGING_TEST_PASSWORD in the repo's .env.overnight
# (git-ignored), a booted simulator, and the app on it. The app must be a
# staging build of the code you're testing: after changing mobile/src, build
# one with `cd mobile && npx eas-cli build --profile ios-simulator
# --platform ios`, then drag the .app onto the simulator. Changing only the
# .yaml journeys needs no new build.
#
# The journeys use STAGING (fake data only), exactly as GitHub's run does.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
main="$(cd "$(git -C "$repo" rev-parse --git-common-dir)/.." && pwd)" # .env.overnight lives in the main checkout

# The Mac's own bash (3.2) has no lookup tables, hence a function.
flow() { case "$1" in tour) echo musician-tour ;; cant-play) echo cant-play ;; dex) echo dex-phone ;; gus) echo gus-edges ;; *) return 1 ;; esac; }
if [[ "${1:-}" == "--list" || $# -eq 0 ]]; then
  echo "Journeys: tour cant-play dex gus"; exit 0
fi
for j in "$@"; do flow "$j" >/dev/null || { echo "x Unknown journey: $j (try --list)"; exit 1; }; done

command -v maestro >/dev/null || { echo "x Maestro isn't on the PATH. Open a new terminal (~/.zshrc adds it)."; exit 1; }
xcrun simctl list devices booted | grep -q Booted || { echo "x No simulator is running. Open Simulator first."; exit 1; }

# Staging's address and public key (repository variables, public by design).
R=irismusicproject/iris-app
export EXPO_PUBLIC_SUPABASE_URL="$(gh api repos/$R/actions/variables/STAGING_SUPABASE_URL --jq .value)"
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(gh api repos/$R/actions/variables/STAGING_SUPABASE_PUBLISHABLE_KEY --jq .value)"
# The fake accounts' password, from the git-ignored file (never printed).
STAGING_TEST_PASSWORD="$(grep -E '^STAGING_TEST_PASSWORD=' "$main/.env.overnight" | cut -d= -f2- | tr -d '"')"
export STAGING_TEST_PASSWORD
[[ -n "$STAGING_TEST_PASSWORD" ]] || { echo "x STAGING_TEST_PASSWORD missing from $main/.env.overnight"; exit 1; }

# Get staging ready, as GitHub does, and pass the KEY=value lines to Maestro.
envs=(-e "MAESTRO_PASSWORD=$STAGING_TEST_PASSWORD")
collect() { while IFS= read -r line; do [[ "$line" == MAESTRO_*=* ]] && envs+=(-e "$line"); done; }
collect < <(node "$here/prepare-staging.mjs")
# The simulator keeps the Mac's time zone.
if [[ " $* " == *" dex "* ]]; then collect < <(PHONE_TIME_ZONE="$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')" node "$here/prepare-dex.mjs"); fi
if [[ " $* " == *" gus "* ]]; then collect < <(node "$here/prepare-gus.mjs"); fi

out="$repo/mobile/maestro-local"
failed=()
for j in "$@"; do
  echo "== $j"
  # The iPhone Keychain (where the app keeps its sign-in) survives Maestro's
  # clearState, so the last person would still be signed in. Simulator only.
  xcrun simctl keychain booted reset
  if ! maestro test "$here/$(flow "$j").yaml" "${envs[@]}" --test-output-dir "$out" --debug-output "$out/debug"; then failed+=("$j"); fi
  if [[ "$j" == gus ]]; then node "$here/prepare-gus.mjs" --cleanup || failed+=("gus cleanup"); fi
done

echo
if ((${#failed[@]})); then
  echo "x Failed: ${failed[*]}  (screenshots and logs: $out)"; exit 1
fi
echo "✓ Passed: $*"
