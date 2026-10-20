#!/usr/bin/env bash
# Runs measure.py against a tiny fixture vault and checks the key numbers.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT=$(python3 -I "$HERE/../skills/simple-brain-assess/scripts/measure.py" "$HERE/fixtures/vault")
fail=0
check(){ grep -q -- "$1" <<<"$OUT" && echo "ok   $1" || { echo "FAIL $1"; fail=1; }; }
check "raw items 2 | not yet curated 1 | without a human decision field 1"
check "wiki pages 3 | orphan wiki pages 2 | broken link targets 1 | malformed frontmatter 1"
check "AI-written wiki pages 1 | wiki pages without any source/link 2 | open question/warning callouts 1"
exit $fail
