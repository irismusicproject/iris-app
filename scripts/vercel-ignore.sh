#!/usr/bin/env bash
# Vercel's "Ignored Build Step" (vercel.json, ignoreCommand): exit 0 skips the
# build, exit 1 builds. Skip only when we can SEE that nothing outside mobile/
# changed since the last deployment. Vercel clones just recent history, so the
# previous deployment's commit can be missing (v0.8, Nov 27, 2026: the last
# release was 66 commits back, `git diff` failed with "bad object", and Vercel
# counted that as a failed deployment, so the live site stayed on v0.7). When
# in doubt, build.
prev="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "Previous commit $prev isn't in this clone: building."
  exit 1
fi
if git diff --quiet "$prev" HEAD -- . ':(exclude)mobile'; then
  echo "Nothing outside mobile/ changed since $prev: skipping the website build."
  exit 0
fi
echo "Website code changed since $prev: building."
exit 1
