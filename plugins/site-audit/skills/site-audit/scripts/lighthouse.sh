#!/usr/bin/env bash
# Lighthouse: N runs (default 3), keeps the median run by Performance score, prints a compact summary
# with failing audits + the elements behind them, and writes lh-<mode>.json (small, diffable).
# Usage: lighthouse.sh <url> [mobile|desktop] [--runs N] [--out dir]
set -uo pipefail
URL="${1:?usage: lighthouse.sh <url> [mobile|desktop] [--runs N] [--out dir]}"; MODE="${2:-mobile}"
RUNS=3; OUT="${TMPDIR:-/tmp}/site-audit"
shift; [ $# -gt 0 ] && shift
while [ $# -gt 0 ]; do case "$1" in --runs) RUNS="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) shift;; esac; done
mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
PRESET=(); [ "$MODE" = desktop ] && PRESET=(--preset=desktop)
FILES=()
for i in $(seq 1 "$RUNS"); do
  F="$OUT/lh-$MODE-run$i.json"
  npx -y lighthouse@latest "$URL" ${PRESET[@]+"${PRESET[@]}"} \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output-path="$F" --quiet \
    --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>&1 && FILES+=("$F")
done
[ ${#FILES[@]} -eq 0 ] && { echo "lighthouse failed (Chrome/network?). For public URLs try https://pagespeed.web.dev"; exit 1; }
node "$HERE/lh-summary.mjs" "$MODE" "$OUT/lh-$MODE.json" "${FILES[@]}"
