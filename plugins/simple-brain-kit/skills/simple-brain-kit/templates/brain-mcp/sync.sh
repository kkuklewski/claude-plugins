#!/usr/bin/env bash
# Host-side sync for the vault clone that brain-mcp serves. Run it every few minutes (cron/systemd).
#  1. commits NEW capture files only (never anything else, never a file that was already tracked);
#  2. pulls the nightly runs' commits (fast-forward or a plain rebase of the capture commit);
#  3. pushes. Never force-pushes. Any failure stops the script with a non-zero exit.
# Usage: sync.sh <vault-dir>
set -euo pipefail
cd "${1:?usage: sync.sh <vault-dir>}"
if command -v flock >/dev/null; then exec 9>.git/brain-sync.lock; flock -n 9 || exit 0; fi  # one sync at a time

NEW=()
while IFS= read -r f; do NEW+=("$f"); done < <(git ls-files --others --exclude-standard -- 'inbox/captures/*.md')
if [ ${#NEW[@]} -gt 0 ]; then
  git add -- "${NEW[@]}"
  # Guard: only the new capture files may be staged.
  if git diff --cached --name-only | grep -qvE '^inbox/captures/[^/]+\.md$'; then
    git reset -q; echo "sync: refusing, something outside inbox/captures was staged" >&2; exit 1
  fi
  git commit -q -m "brain(capture): ${#NEW[@]} new"
fi

git pull -q --rebase
git push -q
