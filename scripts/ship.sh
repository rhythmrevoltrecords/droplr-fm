#!/usr/bin/env bash
#
# One batch of work -> one branch -> one pull request, every time.
#
#   ./scripts/ship.sh <name> <message-file> [new files...]
#   ./scripts/ship.sh bio-search .git/SEARCH_MSG.txt src/lib/thing.ts
#
# Why this exists: merging a pull request closes it, but the branch stays behind and accepts more
# commits. Pushing to it again then lands work on a branch nothing is watching, which looked
# exactly like "my push disappeared" four times in one day. A fresh branch per batch cannot do
# that, because a branch with no merged pull request always offers a new one.
#
# Only files git already tracks are staged automatically (git add -u). Anything new has to be
# named on the command line, so a stray folder in the working tree can never ride along.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: ./scripts/ship.sh <name> <message-file> [new files...]" >&2
  exit 1
fi

name="$1"; shift
msg="$1"; shift

[ -f "$msg" ] || { echo "no such message file: $msg" >&2; exit 1; }

branch="feat/${name}-$(date +%m%d-%H%M)"
git checkout -b "$branch"
git add -u
if [ "$#" -gt 0 ]; then git add -- "$@"; fi

git diff --cached --quiet && { echo "nothing staged; did you mean to pass the new files?" >&2; exit 1; }

git commit -F "$msg"
git push -u origin "$branch"

remote="$(git config --get remote.origin.url)"
slug="$(printf '%s' "$remote" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
url="https://github.com/${slug}/compare/${branch}?expand=1"

echo
echo "Open the pull request:"
echo "  $url"
command -v open >/dev/null 2>&1 && open "$url" || true
