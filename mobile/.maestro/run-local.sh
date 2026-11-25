#!/usr/bin/env bash
# Run phone journeys on this Mac, in minutes, instead of a 40-minute GitHub
# run (Ryan, Nov 25, 2026). Use it to get a journey passing; GitHub's run is
# the final check, not the debugger (CLAUDE.md, "Testing habits").
#
#   mobile/.maestro/run-local.sh gus               one journey, Android emulator
#   mobile/.maestro/run-local.sh gus violet        several
#   mobile/.maestro/run-local.sh all               every journey (~30 min)
#   mobile/.maestro/run-local.sh --ios tour        on the iPhone simulator
#   mobile/.maestro/run-local.sh --list
#
# ANDROID (the default) runs the very same mobile/.maestro/run-ci.sh as
# GitHub, on a local emulator ("iris": Android 34, Arizona time), with the
# app file GitHub's newest phone-journeys run built (artifact
# "iris-staging-apk"; pass APK=/path/to/app.apk to use another). After
# changing mobile/src, run the GitHub workflow once (journeys: tour is enough)
# to get a fresh app file, or build one yourself.
#
# IOS (--ios) needs a booted simulator with a staging build installed
# (`cd mobile && npx eas-cli build --profile ios-simulator --platform ios`).
# iOS can't switch airplane mode or move the clock, so only tour, cant-play,
# dex and gus run there, and iOS has its own quirks (docs/TESTING-BACKLOG.md).
#
# Needs, once: Java, Maestro and the Android tools (installed Nov 25;
# ~/.zshrc puts them on the PATH), the GitHub CLI signed in, and
# STAGING_TEST_PASSWORD in the repo's .env.overnight (git-ignored; never
# printed). The journeys use STAGING (fake data only), as GitHub's run does.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
mobile="$(cd "$here/.." && pwd)"
main="$(cd "$(git -C "$mobile" rev-parse --git-common-dir)/.." && pwd)" # .env.overnight lives in the main checkout
R=irismusicproject/iris-app
ALL="tour cant-play fern dex violet gus vera"

platform=android
if [[ "${1:-}" == "--ios" ]]; then platform=ios; shift; fi
if [[ "${1:-}" == "--list" || $# -eq 0 ]]; then
  echo "Journeys: $ALL (or: all). On --ios: tour cant-play dex gus."; exit 0
fi
journeys="$*"; [[ "$journeys" == all ]] && journeys="$ALL"
for j in $journeys; do [[ " $ALL " == *" $j "* ]] || { echo "x Unknown journey: $j (try --list)"; exit 1; }; done
want() { [[ " $journeys " == *" $1 "* ]]; }

command -v maestro >/dev/null || { echo "x Maestro isn't on the PATH. Open a new terminal (~/.zshrc adds it)."; exit 1; }

# Staging's address and public key (repository variables, public by design)
# and the fake accounts' password (git-ignored file).
export EXPO_PUBLIC_SUPABASE_URL="$(gh api repos/$R/actions/variables/STAGING_SUPABASE_URL --jq .value)"
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(gh api repos/$R/actions/variables/STAGING_SUPABASE_PUBLISHABLE_KEY --jq .value)"
STAGING_TEST_PASSWORD="$(grep -E '^STAGING_TEST_PASSWORD=' "$main/.env.overnight" | cut -d= -f2- | tr -d '"')"
export STAGING_TEST_PASSWORD
[[ -n "$STAGING_TEST_PASSWORD" ]] || { echo "x STAGING_TEST_PASSWORD missing from $main/.env.overnight"; exit 1; }
# As in the workflow's settings (.github/workflows/phone-journeys.yml).
export MAESTRO_PASSWORD="$STAGING_TEST_PASSWORD"
export MAESTRO_FERN_EMAIL=fern.flute@example.com
export MAESTRO_VIOLET_EMAIL=violet.viola@example.com
export MAESTRO_RUN="local-$(date +%Y%m%d-%H%M%S)"

# Get staging ready, as GitHub does. Maestro reads every MAESTRO_* variable.
load() { while IFS= read -r line; do [[ "$line" == MAESTRO_*=* ]] && export "${line?}"; done; }
load < <(node "$here/prepare-staging.mjs")
export MAESTRO_DEX_DAY= MAESTRO_GUS_DAY1=
tz=America/Phoenix; [[ $platform == ios ]] && tz="$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')"
if want dex; then load < <(PHONE_TIME_ZONE="$tz" node "$here/prepare-dex.mjs"); fi
if want gus; then load < <(node "$here/prepare-gus.mjs"); fi

if [[ $platform == android ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  # The app file: GitHub's newest build, kept in mobile/maestro-local/apk.
  if [[ -z "${APK:-}" ]]; then
    id="$(gh api "repos/$R/actions/artifacts?name=iris-staging-apk&per_page=1" --jq '.artifacts[0].id // empty')"
    [[ -n "$id" ]] || { echo "x No app file on GitHub yet. Run the Phone journeys workflow once (journeys: tour)."; exit 1; }
    APK="$mobile/maestro-local/apk/$id/app-release.apk"
    if [[ ! -f "$APK" ]]; then
      echo "Downloading the app file GitHub built (artifact $id)…"
      mkdir -p "$(dirname "$APK")"
      gh api "repos/$R/actions/artifacts/$id/zip" > "$APK.zip" && unzip -qo "$APK.zip" -d "$(dirname "$APK")" && rm "$APK.zip"
    fi
  fi
  export APK
  # The emulator, started if it isn't running (Arizona time, like GitHub's).
  if ! adb devices | grep -q "emulator-.*device$"; then
    echo "Starting the Android emulator…"
    nohup emulator -avd iris -timezone America/Phoenix -no-boot-anim -no-snapshot-save >/dev/null 2>&1 &
    adb wait-for-device
    until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 2; done
  fi
  # A clean phone for each run: no screen lock (Fern's first part needs none), signal on.
  adb shell locksettings clear --old 1111 >/dev/null 2>&1 || true
  adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  adb shell settings put system font_scale 1.0
  cd "$mobile"
  JOURNEYS="$(echo $journeys | tr ' ' ,)" bash "$here/run-ci.sh"
  exit $?
fi

# iOS: the simulator can't switch airplane mode or move the clock.
for j in $journeys; do
  case $j in fern|violet|vera) echo "x $j can't run on the iPhone simulator; leave out --ios"; exit 1 ;; esac
done
xcrun simctl list devices booted | grep -q Booted || { echo "x No simulator is running. Open Simulator first."; exit 1; }
flow() { case "$1" in tour) echo musician-tour ;; cant-play) echo cant-play ;; dex) echo dex-phone ;; gus) echo gus-edges ;; esac; }
out="$mobile/maestro-local"
failed=()
for j in $journeys; do
  echo "== $j"
  # The iPhone Keychain (where the app keeps its sign-in) survives Maestro's
  # clearState, so the last person would still be signed in. Simulator only.
  xcrun simctl keychain booted reset
  maestro test "$here/$(flow "$j").yaml" --test-output-dir "$out" --debug-output "$out/debug" || failed+=("$j")
  if [[ "$j" == gus ]]; then node "$here/prepare-gus.mjs" --cleanup || failed+=("gus cleanup"); fi
done
echo
if ((${#failed[@]})); then echo "x Failed: ${failed[*]}  (screenshots and logs: $out)"; exit 1; fi
echo "✓ Passed: $journeys"
