#!/usr/bin/env bash
# The phone journeys on GitHub's Android emulator, called by
# .github/workflows/phone-journeys.yml (the emulator step runs each line of
# its own script separately, so multi-line logic lives here). Runs from
# mobile/. JOURNEYS picks which: "all" (default) or a comma list of tour,
# cant-play, fern, dex, violet, gus, vera. Every chosen journey runs even if
# an earlier one fails; failures are listed in failed-journeys.txt.
set -u
JOURNEYS="${JOURNEYS:-all}"
rm -f failed-journeys.txt
adb install -r android/app/build/outputs/apk/release/app-release.apk
want() { [ "$JOURNEYS" = all ] || case ",${JOURNEYS// /}," in *",$1,"*) true ;; *) false ;; esac; }
if want tour; then maestro test .maestro/musician-tour.yaml --format junit --output maestro-tour.xml --test-output-dir maestro-output || echo "Musician's tour" >> failed-journeys.txt; fi
if want cant-play; then maestro test .maestro/cant-play.yaml --format junit --output maestro-cant-play.xml --test-output-dir maestro-output || echo "I can't play" >> failed-journeys.txt; fi
if want fern; then
  # Fern: no screen lock first (nothing kept), then a PIN and the basement with no signal.
  maestro test .maestro/fern-no-lock.yaml --format junit --output maestro-fern-no-lock.xml --test-output-dir maestro-output || echo "Fern, no screen lock" >> failed-journeys.txt
  adb shell cmd connectivity airplane-mode disable || true
  adb shell locksettings set-pin 1111
  adb shell svc power stayon true
  maestro test .maestro/fern-offline.yaml --format junit --output maestro-fern-offline.xml --test-output-dir maestro-output || echo "Fern, offline" >> failed-journeys.txt
  adb shell cmd connectivity airplane-mode disable || true
  node .maestro/check-offline-sent.mjs || echo "Fern, what reached staging" >> failed-journeys.txt
fi
if want dex; then
  # Dex, phone half; the website half is the next step.
  maestro test .maestro/dex-phone.yaml --format junit --output maestro-dex-phone.xml --test-output-dir maestro-output && touch dex-phone-done || echo "Dex, phone" >> failed-journeys.txt
fi
if want violet; then
  # Offline work needs a screen lock (O12); Fern's part sets it when it runs first.
  adb shell locksettings set-pin 1111 2>/dev/null || true
  adb shell svc power stayon true
  # Violet: logs with no signal, then the phone's clock jumps 15 days (O8: 14), then back with signal.
  maestro test .maestro/violet-away-1.yaml --format junit --output maestro-violet-1.xml --test-output-dir maestro-output || echo "Violet, part 1" >> failed-journeys.txt
  adb root && adb wait-for-device
  adb shell settings put global auto_time 0
  adb shell date "$(TZ=America/Phoenix date -d '+15 days' +%m%d%H%M%Y.%S)" || echo "Violet, moving the clock" >> failed-journeys.txt
  maestro test .maestro/violet-away-2.yaml --format junit --output maestro-violet-2.xml --test-output-dir maestro-output || echo "Violet, part 2" >> failed-journeys.txt
  adb shell date "$(TZ=America/Phoenix date +%m%d%H%M%Y.%S)"
  adb shell settings put global auto_time 1
  maestro test .maestro/violet-away-3.yaml --format junit --output maestro-violet-3.xml --test-output-dir maestro-output || echo "Violet, part 3" >> failed-journeys.txt
  adb shell cmd connectivity airplane-mode disable || true
  node .maestro/check-offline-sent.mjs --email "$MAESTRO_VIOLET_EMAIL" --expect away=1 || echo "Violet, what reached staging" >> failed-journeys.txt
fi
if want gus; then
  # Gus: double taps, the season count, a leader swap. The cleanup always runs.
  maestro test .maestro/gus-edges.yaml --format junit --output maestro-gus.xml --test-output-dir maestro-output || echo "Gus" >> failed-journeys.txt
  node .maestro/prepare-gus.mjs --cleanup || echo "Gus, cleanup" >> failed-journeys.txt
fi
mkdir -p shots/normal-text && (mv *.png shots/normal-text/ 2>/dev/null || true)
if want vera; then
  # Vera: the same tour with the phone's text at its largest.
  adb shell settings put system font_scale 2.0
  maestro test .maestro/musician-tour.yaml --format junit --output maestro-tour-large-text.xml --test-output-dir maestro-output/large-text || echo "Vera, largest text" >> failed-journeys.txt
fi
mkdir -p shots/large-text && (mv *.png shots/large-text/ 2>/dev/null || true)
if [ -s failed-journeys.txt ]; then echo "Failed journeys:"; cat failed-journeys.txt; exit 1; else echo "Every phone journey passed."; fi
